import Link from "next/link";
import { MessageSquare, Search, UserPlus } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Avatar } from "@/components/avatar";
import { EmptyState, PageHeader } from "@/components/ui";
import { openDirect, sendRequest } from "@/features/actions";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { escapeLike } from "@/lib/validation";

export const metadata = { title: "Search" };
type P = { id: string; username: string; display_name: string; avatar_path: string | null; relation: string };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 60);
  const { supabase } = await requireUser();
  const searched = q.length >= 2;
  const [people, rooms, msgs] = searched ? await Promise.all([
    supabase.rpc("search_profiles", { p_query: q }),
    supabase.rpc("search_rooms", { p_query: q }),
    // RLS restricts this to conversations you belong to.
    supabase.from("messages").select("id, conversation_id, body, created_at").is("deleted_at", null).eq("kind", "text")
      .ilike("body", `%${escapeLike(q)}%`).order("created_at", { ascending: false }).limit(10),
  ]) : [null, null, null];
  const p = (people?.data ?? []) as P[];
  const r = (rooms?.data ?? []) as { id: string; title: string; member_count: number }[];
  const m = msgs?.data ?? [];
  const none = searched && !p.length && !r.length && !m.length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Search" subtitle="People, public rooms and your own messages." />
      <form role="search" className="relative mb-6">
        <label htmlFor="q" className="sr-only">Search Skyberry</label>
        <Search aria-hidden size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
        <input id="q" name="q" defaultValue={q} autoFocus placeholder="Search by name or @username" className="field !pl-11" maxLength={60} />
      </form>
      {!searched && <EmptyState icon={Search} title="Find your people">Type at least two characters. Private profiles never appear in search.</EmptyState>}
      {none && <EmptyState icon={Search} title={`Nothing found for “${q}”`}>Check the spelling or try a username.</EmptyState>}
      {p.length > 0 && (
        <section className="mb-6" aria-labelledby="sp"><h2 id="sp" className="mb-2 text-lg font-bold">People</h2>
          <ul className="card divide-y divide-line">
            {p.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 p-3">
                <Avatar name={u.display_name} path={u.avatar_path} />
                <Link href={`/u/${u.username}`} className="min-w-0 flex-1"><b className="block truncate">{u.display_name}</b><span className="text-sm text-dim">@{u.username}</span></Link>
                {u.relation === "friend" ? <ActionButton action={openDirect.bind(null, u.id)}><MessageSquare aria-hidden size={14} />Message</ActionButton>
                  : u.relation === "sent" ? <span className="chip">Requested</span>
                  : <ActionButton className="btn btn-primary btn-sm" action={sendRequest.bind(null, u.id)}><UserPlus aria-hidden size={14} />{u.relation === "received" ? "Accept" : "Connect"}</ActionButton>}
              </li>
            ))}
          </ul></section>
      )}
      {r.length > 0 && (
        <section className="mb-6" aria-labelledby="sr"><h2 id="sr" className="mb-2 text-lg font-bold">Rooms</h2>
          <ul className="card divide-y divide-line">{r.map((x) => (
            <li key={x.id}><Link href={`/chats/${x.id}`} className="flex items-center justify-between p-3 hover:bg-surface2"><b>{x.title}</b><span className="text-sm text-dim">{x.member_count} members</span></Link></li>
          ))}</ul></section>
      )}
      {m.length > 0 && (
        <section aria-labelledby="sm"><h2 id="sm" className="mb-2 text-lg font-bold">Your messages</h2>
          <ul className="card divide-y divide-line">{m.map((x) => (
            <li key={x.id}><Link href={`/chats/${x.conversation_id}`} className="block p-3 hover:bg-surface2"><p className="line-clamp-2">{x.body}</p><p className="text-xs text-faint">{timeAgo(x.created_at)}</p></Link></li>
          ))}</ul></section>
      )}
    </div>
  );
}
