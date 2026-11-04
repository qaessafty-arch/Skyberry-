import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Permanently deletes the signed-in user's account, files and data (cascades in the database). */
export async function DELETE() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const admin = createAdminClient();
  for (const bucket of ["media", "avatars"]) {
    const { data: files } = await admin.storage.from(bucket).list(data.user.id, { limit: 1000 });
    if (files?.length) await admin.storage.from(bucket).remove(files.map((f) => `${data.user.id}/${f.name}`));
  }
  const { error } = await admin.auth.admin.deleteUser(data.user.id);
  if (error) return NextResponse.json({ error: "Could not delete the account." }, { status: 500 });
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
