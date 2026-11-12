import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Settings, UserRound, Users } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ActionButton } from "@/components/action-button";
import { joinRoom } from "@/features/actions";
import { requireUser } from "@/lib/auth";
import { onlineSet, signMedia } from "@/lib/queries";
import type { Message } from "@/lib/types";
import { ChatThread, type MemberInfo, type MediaInfo } from "./thread";

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const { data: conv } = await supabase.from("conversations").select("*").eq("id", id).maybeSingle();
  if (!conv) notFound();

  const { data: memberRows } = await supabase.from("conversation_members").select("user_id, role, last_read_at, muted").eq("conversation_id", id);
  const mine = memberRows?.find((m) => m.user_id === user.id);

  if (!mine) {
    return (
      <div className="mx-auto max-w-lg">
        <div className="card grid justify-items-center gap-3 p-8 text-center">
          <Avatar name={conv.title ?? "Room"} path={conv.avatar_path} size={72} />
          <h1 className="text-[26px] font-extrabold leading-tight">{conv.title}</h1>
          <p className="text-dim">{conv.description || "A public room."}</p>
          <p className="chip"><Users aria-hidden size={14} />{conv.member_count} members</p>
          <ActionButton className="btn btn-primary" action={joinRoom.bind(null, id)}>Join room</ActionButton>
          <Link href="/rooms" className="text-sm font-bold text-brandt">Back to rooms</Link>
        </div>
      </div>
    );
  }

  const ids = (memberRows ?? []).map((m) => m.user_id as string);
  const { data: profs } = await supabase.from("profiles").select("id, username, display_name, avatar_path, accent").in("id", ids);
  const members: Record<string, MemberInfo> = {};
  for (const m of memberRows ?? []) {
    const p = profs?.find((x) => x.id === m.user_id);
    members[m.user_id as string] = {
      id: m.user_id as string, role: m.role as string, lastReadAt: m.last_read_at as string,
      name: p?.display_name ?? "Member", username: p?.username ?? "", avatar: p?.avatar_path ?? null, accent: p?.accent ?? "berry",
    };
  }
  const { data: msgs } = await supabase.from("messages").select("*").eq("conversation_id", id).order("created_at", { ascending: false }).limit(50);
  const messages = ((msgs ?? []) as Message[]).reverse();
  const mediaIds = messages.map((m) => m.media_id).filter(Boolean) as string[];
  const { data: rx } = messages.length
    ? await supabase.from("message_reactions").select("message_id, user_id, emoji").in("message_id", messages.map((m) => m.id))
    : { data: [] };
  const media: Record<string, MediaInfo> = {};
  if (mediaIds.length) {
    const { data: assets } = await supabase.from("media_assets").select("id, path, kind").in("id", mediaIds);
    const urls = await signMedia(supabase, (assets ?? []).map((a) => a.path));
    for (const a of assets ?? []) { const url = urls.get(a.path); if (url) media[a.id] = { url, kind: a.kind }; }
  }
  const other = conv.kind === "direct" ? Object.values(members).find((m) => m.id !== user.id) : undefined;
  const otherOnline = other ? (await onlineSet(supabase, [other.id])).has(other.id) : false;
  const title = conv.kind === "direct" ? other?.name ?? "Chat" : conv.title;

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem-var(--nav-h)-3.25rem)] max-w-3xl flex-col md:h-[calc(100dvh-4.5rem)]">
      <header className="glass mb-3 flex items-center gap-2 rounded-[20px] p-2 pr-3">
        <Link href="/chats" aria-label="Back to chats" className="icon-btn"><ArrowLeft aria-hidden size={20} /></Link>
        <Link href={conv.kind === "direct" && other ? `/u/${other.username}` : `/chats/${id}/settings`} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1 transition-colors hover:bg-white/60"
          aria-label={conv.kind === "direct" ? `View ${title}'s profile` : "Group details"}>
          <Avatar name={title ?? "Chat"} path={conv.kind === "direct" ? other?.avatar : conv.avatar_path} accent={other?.accent} size={40} online={otherOnline} />
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-extrabold">{title}</span>
            <span className="block truncate text-[13px] text-faint">{conv.kind === "direct" ? (otherOnline ? "Online now" : `@${other?.username ?? ""}`) : `${conv.member_count} members · ${conv.kind === "room" ? "Room" : "Group"}`}</span>
          </span>
        </Link>
        {conv.kind === "direct" && other ? (
          <Link href={`/u/${other.username}`} aria-label="Profile" className="icon-btn"><UserRound aria-hidden size={20} /></Link>
        ) : (
          <Link href={`/chats/${id}/settings`} aria-label="Group settings" className="icon-btn"><Settings aria-hidden size={20} /></Link>
        )}
      </header>
      <ChatThread conversationId={id} meId={user.id} kind={conv.kind} myRole={mine.role as string} members={members} initial={messages} initialMedia={media} initialReactions={(rx ?? []) as { message_id: string; user_id: string; emoji: string }[]} />
    </div>
  );
}
