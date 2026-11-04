import { requireUser } from "@/lib/auth";
import { friendsOf, profilesById, signMedia } from "@/lib/queries";
import { CameraStudio, type MomentItem } from "./studio";

export const metadata = { title: "Camera" };

export default async function CameraPage({ searchParams }: { searchParams: Promise<{ tab?: string; author?: string; view?: string }> }) {
  const sp = await searchParams;
  const { supabase, user } = await requireUser();
  const { data: feed } = await supabase.rpc("moment_feed");
  const rows = (feed ?? []) as { id: string; author_id: string; media_id: string; caption: string; overlay_text: string; created_at: string; expires_at: string; viewed: boolean; kind: "image" | "video" }[];
  const [people, friends, { data: assets }, { data: views }] = await Promise.all([
    profilesById(supabase, rows.map((r) => r.author_id)),
    friendsOf(supabase, user.id),
    rows.length ? supabase.from("media_assets").select("id, path").in("id", rows.map((r) => r.media_id)) : Promise.resolve({ data: [] }),
    supabase.from("moment_views").select("moment_id"),
  ]);
  const urls = await signMedia(supabase, (assets ?? []).map((a) => a.path as string));
  const pathOf = new Map((assets ?? []).map((a) => [a.id as string, a.path as string]));
  const seen = new Map<string, number>();
  views?.forEach((v) => seen.set(v.moment_id as string, (seen.get(v.moment_id as string) ?? 0) + 1));
  const moments: MomentItem[] = rows.flatMap((r) => {
    const url = urls.get(pathOf.get(r.media_id) ?? "");
    const p = people.get(r.author_id);
    return url && p ? [{ id: r.id, authorId: r.author_id, authorName: p.display_name, authorUsername: p.username, authorAvatar: p.avatar_path, accent: p.accent,
      url, kind: r.kind, caption: r.caption, overlay: r.overlay_text, expiresAt: r.expires_at, createdAt: r.created_at, viewed: r.viewed, mine: r.author_id === user.id, seenBy: seen.get(r.id) ?? 0 }] : [];
  });
  return (
    <CameraStudio meId={user.id} moments={moments} friends={friends.map((f) => ({ id: f.id, name: f.display_name }))}
      initialTab={sp.tab === "moments" || sp.view ? "moments" : "capture"} focusAuthor={sp.author} focusMoment={sp.view} />
  );
}
