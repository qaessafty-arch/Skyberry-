import Link from "next/link";
import { Star } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { EmptyState, PageHeader } from "@/components/ui";
import { unsaveItem } from "@/features/actions";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { signMedia } from "@/lib/queries";

export const metadata = { title: "Saved" };
type Saved = { id: string; kind: string; message_id: string | null; media_id: string | null; moment_id: string | null; created_at: string };

export default async function SavedPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const { kind = "all" } = await searchParams;
  const { supabase } = await requireUser();
  let query = supabase.from("saved_items").select("*").order("created_at", { ascending: false }).limit(100);
  if (["message", "media", "moment"].includes(kind)) query = query.eq("kind", kind);
  const { data } = await query;
  const items = (data ?? []) as Saved[];
  // Content is re-read through RLS: if you lost access since saving, it shows as unavailable.
  const msgIds = items.map((i) => i.message_id).filter(Boolean) as string[];
  const mediaIds = items.map((i) => i.media_id).filter(Boolean) as string[];
  const momentIds = items.map((i) => i.moment_id).filter(Boolean) as string[];
  const [{ data: msgs }, { data: media }, { data: moments }] = await Promise.all([
    msgIds.length ? supabase.from("messages").select("id, conversation_id, body, kind, deleted_at, created_at").in("id", msgIds) : { data: [] },
    mediaIds.length ? supabase.from("media_assets").select("id, path, kind").in("id", mediaIds) : { data: [] },
    momentIds.length ? supabase.from("moments").select("id, caption, media_id").in("id", momentIds) : { data: [] },
  ]);
  const momentMedia = momentIds.length && moments?.length ? (await supabase.from("media_assets").select("id, path, kind").in("id", moments.map((m) => m.media_id as string))).data ?? [] : [];
  const urls = await signMedia(supabase, [...(media ?? []), ...momentMedia].map((m) => m.path as string));
  const tabs = [["all", "Everything"], ["message", "Messages"], ["media", "Media"], ["moment", "Moments"]];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Saved" subtitle="Only you can see this." />
      <nav aria-label="Filter saved items" className="mb-5 flex flex-wrap gap-2">
        {tabs.map(([k, l]) => <Link key={k} href={k === "all" ? "/saved" : `/saved?kind=${k}`} aria-current={kind === k ? "page" : undefined} className={`chip !min-h-9 !px-4 ${kind === k ? "!border-berryt !text-ink" : ""}`}>{l}</Link>)}
      </nav>
      {items.length === 0 ? <EmptyState icon={Star} title="Nothing saved yet">Tap the star on a message to keep it here.</EmptyState> : (
        <ul className="grid gap-3">
          {items.map((it) => {
            const m = msgs?.find((x) => x.id === it.message_id);
            const a = media?.find((x) => x.id === it.media_id);
            const mo = moments?.find((x) => x.id === it.moment_id);
            const mm = mo ? momentMedia.find((x) => x.id === mo.media_id) : undefined;
            const asset = a ?? mm;
            const url = asset ? urls.get(asset.path as string) : undefined;
            return (
              <li key={it.id} className="card flex items-start gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="chip mb-2 capitalize">{it.kind}</p>
                  {it.kind === "message" && (m && !m.deleted_at ? <><p className="whitespace-pre-wrap break-words">{m.body ?? `[${m.kind}]`}</p>
                    <Link href={`/chats/${m.conversation_id}`} className="text-sm font-bold text-berryt">Open conversation</Link></> : <p className="italic text-dim">No longer available</p>)}
                  {it.kind !== "message" && (url ? (asset?.kind === "video" ? <video src={url} controls preload="metadata" className="max-h-64 rounded-2xl" />
                    // eslint-disable-next-line @next/next/no-img-element
                    : <img src={url} alt={mo?.caption || "Saved media"} className="max-h-64 rounded-2xl" loading="lazy" />) : <p className="italic text-dim">No longer available</p>)}
                  <p className="mt-2 text-xs text-faint">Saved {timeAgo(it.created_at)} ago</p>
                </div>
                <ActionButton className="btn btn-ghost btn-sm" action={unsaveItem.bind(null, it.id)}>Remove</ActionButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
