"use client";
import { Check, CheckCheck, ImagePlus, Pencil, Send, Star, Trash2 } from "lucide-react";
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
const RANK: Record<string, number> = { owner: 4, admin: 3, moderator: 2, member: 1 };

export function ChatThread({ conversationId, meId, kind, myRole, members, initial, initialMedia }: {
  conversationId: string; meId: string; kind: string; myRole: string; members: Record<string, MemberInfo>;
  initial: Message[]; initialMedia: Record<string, MediaInfo>;
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

  async function send(body: string, tempId = crypto.randomUUID()) {
    setError(null);
    setPending((cur) => (cur.some((p) => p.tempId === tempId) ? cur.map((p) => (p.tempId === tempId ? { ...p, failed: false } : p)) : [...cur, { tempId, body }]));
    const { error: err } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: meId, kind: "text", body });
    if (err) {
      setPending((cur) => cur.map((p) => (p.tempId === tempId ? { ...p, failed: true } : p)));
      setError(err.message.includes("slow down") ? "You're sending messages too fast. Wait a moment." : "Message not sent. Tap retry.");
    }
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
            <div key={m.id} className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              {!mine && <Avatar name={who?.name ?? "Former member"} path={who?.avatar} accent={who?.accent} size={28} />}
              <div onClick={() => setSelected((cur) => (cur === m.id ? null : m.id))} className={`max-w-[80%] cursor-default px-3.5 py-2 text-[15px] leading-[1.45] ${mine ? "rounded-[20px] rounded-br-[6px] bg-brand text-white shadow-[0_4px_12px_-8px_rgba(26,120,180,.7)]" : "rounded-[20px] rounded-bl-[6px] border border-line bg-white shadow-[var(--shadow-1)]"}`}>
                {!mine && kind !== "direct" && <p className="mb-0.5 text-xs font-bold text-brandt">{who?.name ?? "Former member"}</p>}
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
                <span className={`flex transition-opacity focus-within:opacity-100 md:group-hover:opacity-100 ${selected === m.id ? "opacity-100" : "opacity-0 max-md:pointer-events-none"}`}>
                  <button className="icon-btn !size-9" aria-label="Save message" onClick={() => void saveItem("message", m.id)}><Star aria-hidden size={15} /></button>
                  {mine && m.kind === "text" && <button className="icon-btn !size-9" aria-label="Edit message" onClick={() => { setEditing(m.id); setText(m.body ?? ""); }}><Pencil aria-hidden size={15} /></button>}
                  {canModerate(m) && <button className="icon-btn !size-9" aria-label="Delete message" onClick={() => { if (window.confirm("Delete this message for everyone?")) void moderateDelete(m.id); }}><Trash2 aria-hidden size={15} /></button>}
                </span>
              )}
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
