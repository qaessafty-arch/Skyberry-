import { Images } from "lucide-react";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { signMedia } from "@/lib/queries";
import { GalleryGrid } from "./grid";

export const metadata = { title: "Gallery" };

export default async function GalleryPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "mine" } = await searchParams;
  const { supabase, user } = await requireUser();
  // "mine" = what I uploaded; "shared" = media others shared into my conversations (RLS-filtered).
  let q = supabase.from("media_assets").select("id, path, kind, purpose, created_at, owner_id").order("created_at", { ascending: false }).limit(120);
  q = view === "shared" ? q.neq("owner_id", user.id) : q.eq("owner_id", user.id);
  const { data } = await q;
  const urls = await signMedia(supabase, (data ?? []).map((m) => m.path));
  const items = (data ?? []).flatMap((m) => { const url = urls.get(m.path); return url ? [{ id: m.id as string, url, kind: m.kind as "image" | "video", mine: m.owner_id === user.id }] : []; });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Gallery" subtitle="Photos and videos you've uploaded or that were shared with you." />
      <nav aria-label="Gallery view" className="mb-5 flex gap-2">
        {[["mine", "My uploads"], ["shared", "Shared with me"]].map(([k, l]) => (
          <a key={k} href={`/gallery?view=${k}`} aria-current={view === k ? "page" : undefined} className={`chip !min-h-9 !px-4 ${view === k ? "!border-brandt !text-ink" : ""}`}>{l}</a>
        ))}
      </nav>
      {items.length === 0 ? <EmptyState icon={Images} title="No media yet" action={view === "mine" ? { href: "/camera", label: "Open camera" } : undefined}>
        {view === "mine" ? "Photos and videos you send or capture will be collected here." : "Media friends send you in chats shows up here."}</EmptyState>
        : <GalleryGrid items={items} />}
    </div>
  );
}
