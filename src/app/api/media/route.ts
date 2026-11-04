import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { LIMITS } from "@/lib/env";
import { sniffMedia } from "@/lib/media-sniff";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
const PURPOSES = new Set(["message", "moment", "gallery"]);

/**
 * Authenticated media upload. The server (not the browser) decides the type from magic bytes,
 * enforces size limits, generates the storage path, uploads AS THE USER (storage RLS applies)
 * and registers the asset. Client-supplied MIME types and filenames are ignored.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  if (!rateLimit(`media:${auth.user.id}`, 30, 60_000)) return NextResponse.json({ error: "Too many uploads. Slow down." }, { status: 429 });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > LIMITS.videoBytes + 1024 * 64) return NextResponse.json({ error: "File is too large." }, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Invalid upload." }, { status: 400 }); }
  const file = form.get("file");
  const purpose = String(form.get("purpose") ?? "gallery");
  if (!(file instanceof File) || !PURPOSES.has(purpose)) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffMedia(bytes);
  if (!sniffed) return NextResponse.json({ error: "Unsupported file type. Use JPG, PNG, WebP, GIF, MP4, WebM or MOV." }, { status: 415 });
  const max = sniffed.kind === "image" ? LIMITS.imageBytes : LIMITS.videoBytes;
  if (bytes.byteLength > max) return NextResponse.json({ error: `File is too large (max ${Math.round(max / 1048576)} MB).` }, { status: 413 });

  const path = `${auth.user.id}/${randomUUID()}.${sniffed.ext}`;
  const { error: upErr } = await supabase.storage.from("media").upload(path, bytes, { contentType: sniffed.mime, upsert: false, cacheControl: "3600" });
  if (upErr) return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 502 });

  const { data: row, error: dbErr } = await supabase.from("media_assets").insert({
    owner_id: auth.user.id, path, kind: sniffed.kind, mime: sniffed.mime, size_bytes: bytes.byteLength, purpose,
    width: Number(form.get("width")) > 0 ? Math.min(Number(form.get("width")), 20000) : null,
    height: Number(form.get("height")) > 0 ? Math.min(Number(form.get("height")), 20000) : null,
  }).select("id, kind").single();
  if (dbErr || !row) {
    await supabase.storage.from("media").remove([path]);
    return NextResponse.json({ error: "Could not save the upload." }, { status: 500 });
  }
  return NextResponse.json({ id: row.id, kind: row.kind }, { status: 201 });
}
