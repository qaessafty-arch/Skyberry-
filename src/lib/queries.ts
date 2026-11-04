import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "@/lib/types";

export type MiniProfile = Pick<Profile, "id" | "username" | "display_name" | "avatar_path" | "accent" | "status_text">;
const MINI = "id, username, display_name, avatar_path, accent, status_text";

export async function profilesById(supabase: SupabaseClient, ids: string[]) {
  const map = new Map<string, MiniProfile>();
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return map;
  const { data } = await supabase.from("profiles").select(MINI).in("id", unique);
  (data as MiniProfile[] | null)?.forEach((p) => map.set(p.id, p));
  return map;
}

/** Accepted friends of `me` (profiles visible to me). */
export async function friendsOf(supabase: SupabaseClient, me: string) {
  const { data: rows } = await supabase.from("connections").select("requester_id, addressee_id").eq("status", "accepted");
  const ids = (rows ?? []).map((r) => (r.requester_id === me ? r.addressee_id : r.requester_id) as string);
  const map = await profilesById(supabase, ids);
  return ids.map((i) => map.get(i)).filter(Boolean) as MiniProfile[];
}

/** Signed URLs (1h) for private media. RLS on storage decides what the caller can sign. */
export async function signMedia(supabase: SupabaseClient, paths: string[]) {
  const out = new Map<string, string>();
  const unique = [...new Set(paths)].filter(Boolean);
  if (!unique.length) return out;
  const { data } = await supabase.storage.from("media").createSignedUrls(unique, 3600);
  data?.forEach((d) => { if (d.path && d.signedUrl) out.set(d.path, d.signedUrl); });
  return out;
}
