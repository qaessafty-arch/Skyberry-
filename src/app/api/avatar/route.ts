import { NextResponse, type NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { LIMITS } from "@/lib/env";
import { sniffMedia } from "@/lib/media-sniff";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** Profile picture / banner upload to the public `avatars` bucket (JPEG, PNG, WebP only, 2 MB). */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  if (!rateLimit(`avatar:${auth.user.id}`, 10, 60_000)) return NextResponse.json({ error: "Too many uploads." }, { status: 429 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const slot = form?.get("slot") === "banner" ? "banner_path" : "avatar_path";
  if (!(file instanceof File)) return NextResponse.json({ error: "Invalid upload." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const sniffed = sniffMedia(bytes);
  if (!sniffed || !["image/jpeg", "image/png", "image/webp"].includes(sniffed.mime)) {
    return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 415 });
  }
  if (bytes.byteLength > LIMITS.avatarBytes) return NextResponse.json({ error: "Image must be under 2 MB." }, { status: 413 });
  const path = `${auth.user.id}/${slot === "banner_path" ? "banner" : "avatar"}-${randomUUID()}.${sniffed.ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, bytes, { contentType: sniffed.mime, cacheControl: "31536000" });
  if (error) return NextResponse.json({ error: "Upload failed." }, { status: 502 });
  const { error: dbErr } = await supabase.from("profiles").update({ [slot]: path }).eq("id", auth.user.id);
  if (dbErr) return NextResponse.json({ error: "Could not update your profile." }, { status: 500 });
  return NextResponse.json({ path });
}
