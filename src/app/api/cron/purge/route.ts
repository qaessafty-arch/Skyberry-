import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || secret.length < 16) return false;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Scheduled cleanup: deletes expired Moments (+1h grace) and their files. Call hourly. */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("purge_expired_moments");
  if (error) return NextResponse.json({ error: "purge failed" }, { status: 500 });
  const paths = ((data ?? []) as { path: string }[]).map((r) => r.path);
  if (paths.length) await admin.storage.from("media").remove(paths);
  return NextResponse.json({ purged: paths.length });
}
