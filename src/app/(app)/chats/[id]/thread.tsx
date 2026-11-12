"use client";
import { Check, CheckCheck, Flag, Flame, Frown, Heart, ImagePlus, Laugh, Pencil, Reply, Send, SmilePlus, Sparkles, Star, ThumbsUp, Trash2, X, type LucideIcon } from "lucide-react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/avatar";
import { Spinner } from "@/components/ui";
import { moderateDelete, saveItem } from "@/features/actions";
import { timeAgo } from "@/lib/format";
import { getBrowserClient } from "@/lib/supabase/client";
import type { Message } from "@/lib/types";
import { precheck, preparePhoto, uploadMedia } from "@/lib/upload-client";

export type MemberInfo = { id: string; role: string; lastReadAt: string; name: string; username: string; avatar: string | null; accent: string };
export type MediaInfo = { url: string; kind: "image" | "video" };
type Pending = { tempId: string; body: string; failed?: boolean };
export type Reaction = { message_id: string; user_id: string; emoji: string };
/** Reactions use the same Lucide icon family as the rest of the UI (never emoji glyphs). */
const REACTIONS: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "heart", label: "Love", Icon: Heart }, { key: "laugh", label: "Haha", Icon: Laugh }, { key: "wow", label: "Wow", Icon: Sparkles },
  { key: "sad", label: "Sad", Icon: Frown }, { key: "thumbs_up", label: "Like", Icon: ThumbsUp }, { key: "fire", label: "Fire", Icon: Flame },
];
const REASONS = [["spam", "Spam"], ["harassment", "Harassment or bullying"], ["inappropriate", "Inappropriate content"], ["impersonation", "Impersonation"], ["other", "Something else"]] as const;
const RANK: Record<string, number> = { owner: 4, admin: 3, moderator: 2, member: 1 };

export function ChatThread({ conversationId, meId, kind, myRole, members, initial, initialMedia, initialReactions = [] }: {
  conversationId: string; meId: string; kind: string; myRole: string; members: Record<string, MemberInfo>;
  initial: Message[]; initialMedia: Record<string, MediaInfo>; initialReactions?: Reaction[];
}) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [messages, setMessages] = useState<Message[]>(initial);
  const [media, setMedia] = useState(initialMedia);
  const [pending, setPending] = useState<Pending[]>([]);
  const [reads, setReads] = useState<Record<string, string>>(() => Object.fromEntries(Object.values(members).map((m) => [m.id, m.lastReadAt])));
  const [typing, setTyping] = useState<Record<string, number>>({});
  const [text, setText] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [picker, setPicker] = useState<string | null>(null);
  const [reporting, setReporting] = useState<Message | null>(null);
  const [reportNote, setReportNote] = useState<string | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>(initialReactions);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(initial.length >= 50);
  const [loadingMore, setLoadingMore] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTypingSent = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const newestAt = useRef<string>(initial[initial.length - 1]?.created_at ?? new Date(0).toISOString());
  useEffect(() => { const last = messages[messages.length - 1]; if (last && last.created_at > newestAt.current) newestAt.current = last.created_at; }, [messages]);

  const markRead = useCallback(() => { void supabase.rpc("mark_conversation_read", { p_conv: conversationId }); }, [supabase, conversationId]);

  const loadMedia = useCallback(async (m: Message) => {
    if (!m.media_id) return;
    const { data } = await supabase.from("media_assets").select("id, path, kind").eq("id", m.media_id).maybeSingle();
    if (!data) return;
    const { data: signed } = await supabase.storage.from("media").createSignedUrl(data.path, 3600);
    if (signed?.signedUrl) setMedia((cur) => ({ ...cur, [data.id]: { url: signed.signedUrl, kind: data.kind } }));
  }, [supabase]);

  useEffect(() => { markRead(); }, [markRead]);
  useEffect(() => { bottom.current?.scrollIntoView({ block: "end" }); }, [messages.length, pending.length]);

  useEffect(() => {
    const channel = supabase.channel(`chat:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (p: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const m = p.new as Message;
        setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
        setPending((cur) => cur.filter((x) => !(m.sender_id === meId && x.body === m.body)));
        if (m.media_id) void loadMedia(m);
        if (m.sender_id !== meId) markRead();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (p: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const m = p.new as Message;
        setMessages((cur) => cur.map((x) => (x.id === m.id ? m : x)));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, (p: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        // RLS limits delivery to conversations I belong to; ignore other open chats.
        if (p.eventType === "INSERT") {
          const r = p.new as unknown as Reaction;
          setReactions((cur) => (cur.some((x) => x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji) ? cur : [...cur, r]));
        } else if (p.eventType === "DELETE") {
          const r = p.old as unknown as Reaction;
          setReactions((cur) => cur.filter((x) => !(x.message_id === r.message_id && x.user_id === r.user_id && x.emoji === r.emoji)));
        }
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversation_members", filter: `conversation_id=eq.${conversationId}` }, (p: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const row = p.new as { user_id: string; last_read_at: string };
        setReads((cur) => ({ ...cur, [row.user_id]: row.last_read_at }));
      })
      .subscribe((status: string) => {
        // (Re)connected: fetch anything sent while the live connection was being established or was down.
        if (status !== "SUBSCRIBED") return;
        void supabase.from("messages").select("*").eq("conversation_id", conversationId).gt("created_at", newestAt.current)
          .order("created_at").limit(100).then(({ data }: { data: unknown[] | null }) => {
            const missed = (data ?? []) as Message[];
            if (!missed.length) return;
            setMessages((cur) => [...cur, ...missed.filter((m) => !cur.some((x) => x.id === m.id))]);
            missed.forEach((m) => { if (m.media_id) void loadMedia(m); });
            markRead();
          });
      });
    // Private broadcast channel: realtime.messages RLS only admits conversation members.
    const tc = supabase.channel(`typing:${conversationId}`, { config: { private: true } })
      .on("broadcast", { event: "typing" }, ({ payload }: { payload: Record<string, unknown> }) => {
        const uid = (payload as { user: string }).user;
        if (uid !== meId) setTyping((cur) => ({ ...cur, [uid]: Date.now() }));
      })
      .subscribe();
    typingChannel.current = tc;
    const sweep = setInterval(() => setTyping((cur) => Object.fromEntries(Object.entries(cur).filter(([, t]) => Date.now() - t < 4000))), 1500);
    return () => { clearInterval(sweep); void supabase.removeChannel(channel); void supabase.removeChannel(tc); typingChannel.current = null; };
  }, [supabase, conversationId, meId, loadMedia, markRead]);

  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (v && now - lastTypingSent.current > 2500) {
      lastTypingSent.current = now;
      void typingChannel.current?.send({ type: "broadcast", event: "typing", payload: { user: meId } });
    }
  }

  async function send(body: string, tempId = crypto.randomUUID(), reply: string | null = replyTo?.id ?? null) {
    setError(null);
    setReplyTo(null);
    setPending((cur) => (cur.some((p) => p.tempId === tempId) ? cur.map((p) => (p.tempId === tempId ? { ...p, failed: false } : p)) : [...cur, { tempId, body }]));
    const { error: err } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: meId, kind: "text", body, reply_to: reply });
    if (err) {
      setPending((cur) => cur.map((p) => (p.tempId === tempId ? { ...p, failed: true } : p)));
      setError(err.message.includes("slow down") ? "You're sending messages too fast. Wait a moment." : "Message not sent. Tap retry.");
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    setPicker(null);
    const mineNow = reactions.some((r) => r.message_id === messageId && r.user_id === meId && r.emoji === emoji);
    // optimistic, reconciled by realtime
    setReactions((cur) => (mineNow ? cur.filter((r) => !(r.message_id === messageId && r.user_id === meId && r.emoji === emoji)) : [...cur, { message_id: messageId, user_id: meId, emoji }]));
    const q = mineNow
      ? supabase.from("message_reactions").delete().match({ message_id: messageId, user_id: meId, emoji })
      : supabase.from("message_reactions").insert({ message_id: messageId, user_id: meId, emoji });
    const { error: err } = await q;
    if (err && err.code !== "23505") setError("Couldn't update the reaction.");
  }

  async function submitReport(m: Message, reason: string) {
    const { error: err } = await supabase.rpc("submit_report", { p_target_user: null, p_message: m.id, p_reason: reason, p_details: "" });
    setReportNote(err ? (/too many/.test(err.message) ? "You've sent a lot of reports. Try again later." : "Couldn't send the report.") : "Thanks. The report was sent to the Skyberry team.");
    setReporting(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    if (editing) {
      const { error: err } = await supabase.rpc("edit_message", { p_id: editing, p_body: body });
      if (err) setError("You can't edit that message."); else { setEditing(null); setText(""); }
      return;
    }
    setText("");
    await send(body);
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const bad = precheck(file);
    if (bad) { setError(bad); return; }
    setError(null); setUploadPct(0);
    try {
      const up = await uploadMedia(await preparePhoto(file), "message", setUploadPct);
      const { error: err } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: meId, kind: up.kind, media_id: up.id });
      if (err) setError("Couldn't send the file.");
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed."); }
    finally { setUploadPct(null); if (fileInput.current) fileInput.current.value = ""; }
  }

  async function loadEarlier() {
    setLoadingMore(true);
    const oldest = messages[0]?.created_at;
    const { data } = await supabase.from("messages").select("*").eq("conversation_id", conversationId).lt("created_at", oldest ?? new Date().toISOString())
      .order("created_at", { ascending: false }).limit(50);
    const older = ((data ?? []) as Message[]).reverse();
    setMessages((cur) => [...older, ...cur]);
    older.forEach((m) => void loadMedia(m));
    if (older.length) {
      const { data: rx } = await supabase.from("message_reactions").select("message_id, user_id, emoji").in("message_id", older.map((m) => m.id));
      setReactions((cur) => [...cur, ...((rx ?? []) as Reaction[])]);
    }
    setHasMore((data?.length ?? 0) >= 50);
    setLoadingMore(false);
  }

  const others = Object.values(members).filter((m) => m.id !== meId);
  const typers = others.filter((m) => typing[m.id]);
  const seenBy = (m: Message) => others.some((o) => (reads[o.id] ?? "") >= m.created_at);
  const canModerate = (m: Message) => m.sender_id === meId || (kind !== "direct" && (RANK[myRole] ?? 0) >= 2 && (RANK[myRole] ?? 0) > (RANK[members[m.sender_id ?? ""]?.role ?? "member"] ?? 1));

  return (
    <section aria-label="Conversation" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex-1 space-y-1.5 overflow-y-auto px-1 py-3" role="log" aria-live="polite" aria-relevant="additions">
        {hasMore && <button className="btn btn-ghost btn-sm mx-auto flex" onClick={loadEarlier} disabled={loadingMore}>{loadingMore ? <Spinner /> : "Load earlier messages"}</button>}
        {messages.length === 0 && pending.length === 0 && <p className="py-10 text-center text-dim">No messages yet. Say hello!</p>}
        {messages.map((m) => {
          if (m.kind === "system") return <p key={m.id} className="py-2 text-center"><span className="chip">{m.body}</span></p>;
          const mine = m.sender_id === meId;
          const who = members[m.sender_id ?? ""];
          const mi = m.media_id ? media[m.media_id] : undefined;
          return (
            <div key={m.id}>
            <div className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              {!mine && <Avatar name={who?.name ?? "Former member"} path={who?.avatar} accent={who?.accent} size={28} />}
              <div onClick={() => setSelected((cur) => (cur === m.id ? null : m.id))} className={`max-w-[80%] cursor-default px-3.5 py-2 text-[15px] leading-[1.45] ${mine ? "rounded-[20px] rounded-br-[6px] bg-brand text-white shadow-[0_4px_12px_-8px_rgba(26,120,180,.7)]" : "rounded-[20px] rounded-bl-[6px] border border-line bg-white shadow-[var(--shadow-1)]"}`}>
                {!mine && kind !== "direct" && <p className="mb-0.5 text-xs font-bold text-brandt">{who?.name ?? "Former member"}</p>}
                {m.reply_to && (() => {
                  const parent = messages.find((x) => x.id === m.reply_to);
                  const pn = parent ? members[parent.sender_id ?? ""]?.name ?? "Someone" : null;
                  return (
                    <div className={`mb-1 rounded-[10px] border-l-[3px] px-2 py-1 text-[13px] ${mine ? "border-white/70 bg-white/15" : "border-sky bg-surface2"}`}>
                      <b className="block text-[12px]">{pn ?? "Earlier message"}</b>
                      <span className="line-clamp-2 opacity-90">{parent ? (parent.deleted_at ? "Message deleted" : parent.body ?? (parent.kind === "image" ? "Photo" : "Video")) : "Load earlier messages to see it"}</span>
                    </div>
                  );
                })()}
                {m.deleted_at ? <p className="italic opacity-70">Message deleted</p> : (
                  <>
                    {m.kind !== "text" && (mi ? (mi.kind === "image"
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={mi.url} alt="Shared photo" className="mb-1 max-h-72 w-full max-w-[280px] rounded-[14px] object-cover" loading="lazy" />
                      : <video src={mi.url} controls preload="metadata" className="mb-1 max-h-72 max-w-[280px] rounded-[14px]" />) : <p className="skeleton h-24 w-40" aria-label="Loading media" />)}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  </>
                )}
                <p className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${mine ? "text-white/85" : "text-faint"}`}>
                  {timeAgo(m.created_at)}{m.edited_at && !m.deleted_at ? " · edited" : ""}
                  {mine && !m.deleted_at && (seenBy(m) ? <CheckCheck aria-label="Seen" size={13} /> : <Check aria-label="Sent" size={13} />)}
                </p>
              </div>
              {!m.deleted_at && (
                <span className={`relative flex transition-opacity focus-within:opacity-100 md:group-hover:opacity-100 ${selected === m.id || picker === m.id ? "opacity-100" : "opacity-0 max-md:pointer-events-none"}`}>
                  <button className="icon-btn !size-9" aria-label="Reply" onClick={() => { setReplyTo(m); setEditing(null); document.getElementById("msg")?.focus(); }}><Reply aria-hidden size={15} /></button>
                  <button className="icon-btn !size-9" aria-label="Add reaction" aria-expanded={picker === m.id} onClick={() => setPicker((c) => (c === m.id ? null : m.id))}><SmilePlus aria-hidden size={15} /></button>
                  {picker === m.id && (
                    <span role="menu" aria-label="Reactions" className={`glass absolute bottom-10 z-20 flex gap-0.5 rounded-full p-1 ${mine ? "right-0" : "left-0"}`}>
                      {REACTIONS.map(({ key, label, Icon }) => (
                        <button key={key} role="menuitem" aria-label={label} onClick={() => void toggleReaction(m.id, key)} className="grid size-9 place-items-center rounded-full text-brandt hover:bg-ice"><Icon aria-hidden size={18} /></button>
                      ))}
                    </span>
                  )}
                  <button className="icon-btn !size-9" aria-label="Save message" onClick={() => void saveItem("message", m.id)}><Star aria-hidden size={15} /></button>
                  {mine && m.kind === "text" && <button className="icon-btn !size-9" aria-label="Edit message" onClick={() => { setEditing(m.id); setText(m.body ?? ""); }}><Pencil aria-hidden size={15} /></button>}
                  {canModerate(m) && <button className="icon-btn !size-9" aria-label="Delete message" onClick={() => { if (window.confirm("Delete this message for everyone?")) void moderateDelete(m.id); }}><Trash2 aria-hidden size={15} /></button>}
                  {!mine && <button className="icon-btn !size-9" aria-label="Report message" onClick={() => setReporting(m)}><Flag aria-hidden size={15} /></button>}
                </span>
              )}
            </div>
            {(() => {
              const mine2 = reactions.filter((r) => r.message_id === m.id);
              if (!mine2.length) return null;
              return (
                <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end pr-1" : "pl-9"}`}>
                  {REACTIONS.filter((x) => mine2.some((r) => r.emoji === x.key)).map(({ key, label, Icon }) => {
                    const list = mine2.filter((r) => r.emoji === key), on = list.some((r) => r.user_id === meId);
                    return (
                      <button key={key} onClick={() => void toggleReaction(m.id, key)} aria-pressed={on} aria-label={`${label}, ${list.length}`}
                        className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-xs font-bold ${on ? "border-sky bg-ice text-brandt" : "border-line bg-white text-dim"}`}>
                        <Icon aria-hidden size={13} />{list.length}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
            </div>
          );
        })}
        {pending.map((p) => (
          <div key={p.tempId} className="flex flex-row-reverse">
            <div className={`max-w-[80%] rounded-[20px] rounded-br-[6px] bg-brand/70 px-3.5 py-2 text-white ${p.failed ? "ring-2 ring-danger" : ""}`}>
              <p className="whitespace-pre-wrap break-words">{p.body}</p>
              <p className="text-right text-[11px]">{p.failed ? <button className="underline" onClick={() => void send(p.body, p.tempId)}>Retry</button> : "Sending…"}</p>
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="h-5 px-3 text-xs font-semibold text-brandt" aria-live="polite">{typers.length > 0 && `${typers.map((t) => t.name).join(", ")} ${typers.length > 1 ? "are" : "is"} typing…`}</div>
      {error && <p role="alert" className="px-4 pb-1 text-sm text-danger">{error}</p>}
      {uploadPct !== null && <div className="mx-2 mb-2 h-1.5 overflow-hidden rounded-full bg-ice" role="progressbar" aria-valuenow={uploadPct} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress"><div className="h-full bg-sky transition-all" style={{ width: `${uploadPct}%` }} /></div>}
      {reportNote && <p role="status" className="px-3 pb-1 text-sm text-success">{reportNote}</p>}
      {reporting && (
        <div className="glass mb-2 rounded-[18px] p-3" role="dialog" aria-label="Report message">
          <div className="mb-2 flex items-center justify-between"><b className="text-[15px]">Report this message</b>
            <button className="icon-btn !size-8" aria-label="Cancel report" onClick={() => setReporting(null)}><X aria-hidden size={16} /></button></div>
          <div className="grid gap-1.5">{REASONS.map(([k, l]) => <button key={k} className="btn btn-soft btn-sm justify-start" onClick={() => void submitReport(reporting, k)}>{l}</button>)}</div>
        </div>
      )}
      {replyTo && (
        <div className="mb-1.5 flex items-center gap-2 rounded-[14px] border-l-[3px] border-sky bg-white/80 px-3 py-1.5 text-[13px]">
          <Reply aria-hidden size={14} className="text-brandt" />
          <span className="min-w-0 flex-1 truncate"><b>Replying to {members[replyTo.sender_id ?? ""]?.name ?? "message"}</b> · {replyTo.body ?? "Photo"}</span>
          <button className="icon-btn !size-7" aria-label="Cancel reply" onClick={() => setReplyTo(null)}><X aria-hidden size={14} /></button>
        </div>
      )}
      <form onSubmit={submit} className="glass flex items-end gap-1.5 rounded-[22px] p-1.5">
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime" className="sr-only" id="chat-file" onChange={(e) => void onFile(e.target.files?.[0])} />
        <label htmlFor="chat-file" className="icon-btn shrink-0 cursor-pointer" aria-label="Attach photo or video"><ImagePlus aria-hidden size={21} strokeWidth={1.9} /></label>
        <label htmlFor="msg" className="sr-only">Message</label>
        <textarea id="msg" value={text} onChange={(e) => onType(e.target.value)} rows={1} maxLength={4000} placeholder={editing ? "Edit your message" : "Write a message"}
          className="max-h-32 min-h-11 flex-1 resize-none bg-transparent px-1 py-2.5 text-[15px] text-ink outline-none placeholder:text-faint"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        {editing && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditing(null); setText(""); }}>Cancel</button>}
        <button type="submit" className="btn btn-primary size-11 shrink-0 !rounded-[15px] !p-0" aria-label={editing ? "Save edit" : "Send message"} disabled={!text.trim()}><Send aria-hidden size={18} /></button>
      </form>
    </section>
  );
}
