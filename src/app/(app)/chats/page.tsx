import Link from "next/link";
import { MessageCircle, Plus, Search, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { LiveRefresh } from "@/components/live-refresh";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import type { ConversationRow } from "@/lib/types";

export const metadata = { title: "Chats" };
const STABLE_TABLES = ["messages", "conversation_members"];

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("my_conversations");
  const needle = q.trim().toLowerCase().slice(0, 60);
  const rows = ((data ?? []) as ConversationRow[]).filter((c) => {
    if (!needle) return true;
    return (c.kind === "direct" ? `${c.other_display_name} ${c.other_username}` : c.title ?? "").toLowerCase().includes(needle);
  });
  return (
    <div className="mx-auto max-w-3xl">
      <LiveRefresh tables={STABLE_TABLES} />
      <PageHeader title="Chats" actions={<Link href="/chats/new" className="btn btn-primary btn-sm"><Plus aria-hidden size={16} />New</Link>} />
      <form role="search" className="relative mb-4">
        <label htmlFor="q" className="sr-only">Search your conversations</label>
        <Search aria-hidden size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
        <input id="q" name="q" defaultValue={q} placeholder="Search conversations" className="field !pl-11" maxLength={60} />
      </form>
      {error ? (
        <p role="alert" className="card-flat p-4 text-danger">We couldn&apos;t load your chats. Refresh to try again.</p>
      ) : rows.length === 0 ? (
        <EmptyState icon={MessageCircle} title={needle ? "No matches" : "Nothing here yet"} action={needle ? undefined : { href: "/chats/new", label: "Start a conversation" }}>
          {needle ? "Try a different name." : "Message a friend or create a group to get things moving."}
        </EmptyState>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {rows.map((c) => {
            const name = c.kind === "direct" ? c.other_display_name ?? "Someone" : c.title ?? "Untitled";
            const unread = Number(c.unread_count);
            return (
              <li key={c.id}>
                <Link href={`/chats/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface2">
                  <Avatar name={name} path={c.kind === "direct" ? c.other_avatar_path : c.avatar_path} size={48} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-bold">
                      <span className="truncate">{name}</span>
                      {c.kind !== "direct" && <Users aria-label={c.kind} size={14} className="shrink-0 text-faint" />}
                    </span>
                    <span className={`block truncate text-sm ${unread ? "font-semibold text-ink" : "text-dim"}`}>{c.last_preview ?? "No messages yet"}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-xs text-faint">{timeAgo(c.last_message_at)}</span>
                    {unread > 0 && <span className="rounded-full bg-berry px-2 text-xs font-bold text-white" aria-label={`${unread} unread`}>{unread}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
