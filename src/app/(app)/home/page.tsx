import Link from "next/link";
import { Camera, Flame, Gamepad2, Images, MessageCircle, Orbit, Star, Users } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/ui";
import { respondRequest } from "@/features/actions";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { profilesById } from "@/lib/queries";
import { petLevel } from "@/lib/universe";
import type { ConversationRow, Streak } from "@/lib/types";

export const metadata = { title: "Home" };

export default async function HomePage() {
  const { supabase, user, profile } = await requireUser();
  await supabase.rpc("ensure_universe");
  const [{ data: convs }, { data: streaks }, { data: requests }, { data: pet }, { data: moments }] = await Promise.all([
    supabase.rpc("my_conversations"),
    supabase.rpc("my_streaks"),
    supabase.from("connections").select("id, requester_id, created_at").eq("addressee_id", user.id).eq("status", "pending"),
    supabase.from("pets").select("name, xp").eq("owner_id", user.id).single(),
    supabase.rpc("moment_feed"),
  ]);
  const all = (convs ?? []) as ConversationRow[];
  const conversations = all.slice(0, 4);
  const unreadTotal = all.reduce((n, c) => n + Number(c.unread_count), 0);
  const feed = (moments ?? []) as { author_id: string; viewed: boolean }[];
  const people = await profilesById(supabase, [...(requests ?? []).map((r) => r.requester_id as string), ...feed.map((m) => m.author_id)]);
  const authors = [...new Map(feed.map((m) => [m.author_id, m])).values()];
  const hour = new Date().getUTCHours();
  const tiles = [
    { href: "/rooms", label: "Rooms", Icon: Users }, { href: "/games", label: "Games", Icon: Gamepad2 },
    { href: "/saved", label: "Saved", Icon: Star }, { href: "/gallery", label: "Gallery", Icon: Images },
  ];
  const myStreaks = (streaks ?? []) as Streak[];

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <header>
        <p className="text-dim">{hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"},</p>
        <h1 className="text-4xl font-extrabold md:text-5xl">{profile.display_name}</h1>
      </header>

      <section aria-label="Moments" className="card flex items-center gap-4 overflow-x-auto p-4">
        <Link href="/camera" className="flex shrink-0 flex-col items-center gap-1 text-xs font-bold">
          <span className="grid size-16 place-items-center rounded-full border-2 border-dashed border-berryt text-berryt"><Camera aria-hidden /></span>New Moment
        </Link>
        {authors.length === 0 && <p className="text-sm text-dim">When friends share Moments they&apos;ll appear here until they expire.</p>}
        {authors.map((m) => {
          const p = people.get(m.author_id);
          if (!p) return null;
          return (
            <Link key={m.author_id} href={`/camera?tab=moments&author=${p.id}`} className="flex shrink-0 flex-col items-center gap-1 text-xs font-bold">
              <span className={`rounded-full p-[3px] ${m.viewed ? "bg-line" : "bg-gradient-to-br from-[#ff7fb0] to-[#6cc8ff]"}`}>
                <Avatar name={p.display_name} path={p.avatar_path} accent={p.accent} size={58} className="ring-2 ring-bg" />
              </span>
              <span className="max-w-16 truncate">{p.display_name}</span>
            </Link>
          );
        })}
      </section>

      {(requests?.length ?? 0) > 0 && (
        <section aria-labelledby="req" className="card p-5">
          <h2 id="req" className="mb-3 text-lg font-bold">Connection requests</h2>
          <ul className="grid gap-3">
            {requests!.map((r) => {
              const p = people.get(r.requester_id as string);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3">
                  <Avatar name={p?.display_name ?? "?"} path={p?.avatar_path} accent={p?.accent} />
                  <div className="min-w-0 flex-1"><Link href={`/u/${p?.username}`} className="font-bold">{p?.display_name}</Link><p className="text-sm text-dim">@{p?.username}</p></div>
                  <ActionButton className="btn btn-primary btn-sm" action={respondRequest.bind(null, r.id as string, true)}>Accept</ActionButton>
                  <ActionButton className="btn btn-ghost btn-sm" action={respondRequest.bind(null, r.id as string, false)}>Decline</ActionButton>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
        <section aria-labelledby="chats" className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="chats" className="text-lg font-bold">Recent chats {unreadTotal > 0 && <span className="chip ml-2 !text-berryt">{unreadTotal} unread</span>}</h2>
            <Link href="/chats" className="text-sm font-bold text-berryt">All chats</Link>
          </div>
          {conversations.length === 0 ? (
            <EmptyState icon={MessageCircle} title="No conversations yet" action={{ href: "/search", label: "Find people" }}>
              Search for a friend by username and say hello.
            </EmptyState>
          ) : (
            <ul className="grid gap-1">
              {conversations.map((c) => {
                const name = c.kind === "direct" ? c.other_display_name ?? "Someone" : c.title ?? "Untitled";
                return (
                  <li key={c.id}>
                    <Link href={`/chats/${c.id}`} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface2">
                      <Avatar name={name} path={c.kind === "direct" ? c.other_avatar_path : c.avatar_path} />
                      <span className="min-w-0 flex-1"><span className="block truncate font-bold">{name}</span><span className="block truncate text-sm text-dim">{c.last_preview ?? "No messages yet"}</span></span>
                      <span className="text-xs text-faint">{timeAgo(c.last_message_at)}</span>
                      {Number(c.unread_count) > 0 && <span className="rounded-full bg-berry px-2 text-xs font-bold text-white">{c.unread_count}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="grid content-start gap-6">
          <section aria-labelledby="streaks" className="card p-5">
            <h2 id="streaks" className="mb-3 flex items-center gap-2 text-lg font-bold"><Flame aria-hidden className="text-sun" size={20} />Streaks</h2>
            {myStreaks.length === 0 ? (
              <p className="text-sm text-dim">Message a friend and have them reply on the same day to start a streak.</p>
            ) : (
              <ul className="grid gap-2">
                {myStreaks.slice(0, 4).map((s) => (
                  <li key={s.partner_id} className="flex items-center gap-3">
                    <Avatar name={s.display_name} path={s.avatar_path} size={36} />
                    <span className="min-w-0 flex-1 truncate font-bold">{s.display_name}</span>
                    <span className="chip">{s.effective_count} day{s.effective_count === 1 ? "" : "s"}</span>
                    <span className={`text-xs font-bold ${s.status === "at_risk" ? "text-sun" : s.status === "complete" ? "text-mint" : "text-faint"}`}>
                      {s.status === "complete" ? "Done today" : s.status === "at_risk" ? "Say hi today" : "Start again"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Link href="/universe" className="card flex items-center gap-4 p-5 hover:brightness-110">
            <span className="grid size-12 place-items-center rounded-2xl bg-surface2 text-berryt"><Orbit aria-hidden /></span>
            <span><span className="block font-bold">{pet?.name ?? "Your pet"} · level {petLevel(pet?.xp ?? 0)}</span><span className="text-sm text-dim">Visit your Universe</span></span>
          </Link>
        </div>
      </div>

      <nav aria-label="Explore" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="card flex min-h-20 items-center gap-3 px-4 font-bold hover:brightness-110">
            <Icon aria-hidden className="text-berryt" size={22} />{label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
