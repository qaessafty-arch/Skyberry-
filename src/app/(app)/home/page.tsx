import Link from "next/link";
import { Suspense } from "react";
import { ChevronRight, Flame, Gamepad2, Images, MessageCircle, Orbit, Plus, Star, UserPlus, Users } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Avatar } from "@/components/avatar";
import { EmptyState, Section } from "@/components/ui";
import { respondRequest } from "@/features/actions";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { onlineSet, profilesById } from "@/lib/queries";
import { levelProgress, petMood } from "@/lib/universe";
import type { ConversationRow, Streak } from "@/lib/types";

export const metadata = { title: "Home" };

const SHORTCUTS = [
  { href: "/rooms", label: "Rooms", Icon: Users },
  { href: "/games", label: "Games", Icon: Gamepad2 },
  { href: "/saved", label: "Saved", Icon: Star },
  { href: "/gallery", label: "Gallery", Icon: Images },
];

/** Greeting renders immediately; everything that needs data streams in below it. */
export default async function HomePage() {
  const { profile } = await requireUser();
  const hour = new Date().getUTCHours();
  const greeting = hour < 5 ? "Still up" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div className="mx-auto grid max-w-5xl gap-5 rise">
      <header className="flex items-center gap-3">
        <Link href="/profile" aria-label="Your profile"><Avatar name={profile.display_name} path={profile.avatar_path} accent={profile.accent} size={48} ring /></Link>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-dim">{greeting}</p>
          <h1 className="truncate text-[26px] font-extrabold leading-tight md:text-[30px]">{profile.display_name}</h1>
        </div>
      </header>
      <Suspense fallback={<HomeSkeleton />}>
        <HomeBody />
      </Suspense>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="grid gap-5" role="status" aria-label="Loading">
      <div className="flex gap-4">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton size-16 !rounded-full" />)}</div>
      <div className="grid gap-5 md:grid-cols-[1.45fr_1fr]">
        <div className="card grid gap-3 p-5">{[0, 1, 2].map((i) => <div key={i} className="flex items-center gap-3"><div className="skeleton size-11 !rounded-full" /><div className="grid flex-1 gap-2"><div className="skeleton h-3.5 w-1/3" /><div className="skeleton h-3 w-2/3" /></div></div>)}</div>
        <div className="skeleton h-44 !rounded-[24px]" />
      </div>
    </div>
  );
}

async function HomeBody() {
  const { supabase, user } = await requireUser();
  const [{ data: convs }, { data: streaks }, { data: requests }, { data: pet }, { data: moments }] = await Promise.all([
    supabase.rpc("my_conversations"),
    supabase.rpc("my_streaks"),
    supabase.from("connections").select("id, requester_id, created_at").eq("addressee_id", user.id).eq("status", "pending"),
    supabase.from("pets").select("name, xp, last_cared_at").eq("owner_id", user.id).maybeSingle(),
    supabase.rpc("moment_feed"),
  ]);
  if (!pet) void supabase.rpc("ensure_universe"); // first visit: create space + pet in the background
  const all = (convs ?? []) as ConversationRow[];
  const conversations = all.slice(0, 5);
  const unreadTotal = all.reduce((n, c) => n + Number(c.unread_count), 0);
  const feed = (moments ?? []) as { author_id: string; viewed: boolean }[];
  const [online, people] = await Promise.all([
    onlineSet(supabase, all.map((c) => c.other_user_id ?? "")),
    profilesById(supabase, [...(requests ?? []).map((r) => r.requester_id as string), ...feed.map((m) => m.author_id)]),
  ]);
  const authors = [...new Map(feed.map((m) => [m.author_id, m])).values()];
  const myStreaks = (streaks ?? []) as Streak[];
  const lp = levelProgress(pet?.xp ?? 0);
  const mood = petMood(pet?.last_cared_at ?? null);

  return (
    <div className="grid gap-5">

      <section aria-label="Moments" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <ul className="flex gap-4 pb-1">
          <li>
            <Link href="/camera" className="flex w-[68px] flex-col items-center gap-1.5 text-center text-xs font-semibold text-dim">
              <span className="grid size-[64px] place-items-center rounded-full border-[1.5px] border-dashed border-sky bg-white text-brandt"><Plus aria-hidden size={24} /></span>
              Your Moment
            </Link>
          </li>
          {authors.map((m) => {
            const p = people.get(m.author_id);
            if (!p) return null;
            return (
              <li key={m.author_id}>
                <Link href={`/camera?tab=moments&author=${p.id}`} className="flex w-[68px] flex-col items-center gap-1.5 text-center text-xs font-semibold">
                  <span className={`rounded-full p-[2.5px] ${m.viewed ? "bg-line" : "bg-[conic-gradient(from_200deg,var(--cyan),var(--sky),var(--sky-deep),var(--cyan))]"}`}>
                    <Avatar name={p.display_name} path={p.avatar_path} accent={p.accent} size={59} className="ring-[2.5px] ring-white" />
                  </span>
                  <span className="w-full truncate">{p.id === user.id ? "You" : p.display_name.split(" ")[0]}</span>
                </Link>
              </li>
            );
          })}
          {authors.length === 0 && <li className="self-center text-sm text-faint">Friends&apos; Moments appear here until they expire.</li>}
        </ul>
      </section>

      {(requests?.length ?? 0) > 0 && (
        <Section title="Connection requests" icon={UserPlus} id="req">
          <ul className="grid gap-3">
            {requests!.map((r) => {
              const p = people.get(r.requester_id as string);
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-3">
                  <Avatar name={p?.display_name ?? "?"} path={p?.avatar_path} accent={p?.accent} size={42} />
                  <Link href={`/u/${p?.username}`} className="min-w-0 flex-1"><b className="block truncate">{p?.display_name}</b><span className="text-sm text-faint">@{p?.username}</span></Link>
                  <div className="flex gap-2">
                    <ActionButton className="btn btn-primary btn-sm" action={respondRequest.bind(null, r.id as string, true)}>Accept</ActionButton>
                    <ActionButton className="btn btn-ghost btn-sm" action={respondRequest.bind(null, r.id as string, false)}>Decline</ActionButton>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <div className="grid gap-5 md:grid-cols-[1.45fr_1fr]">
        <Section title="Recent chats" icon={MessageCircle} id="chats"
          action={<Link href="/chats" className="inline-flex items-center gap-0.5 text-sm font-bold text-brandt">{unreadTotal > 0 ? `${unreadTotal} unread` : "All chats"}<ChevronRight aria-hidden size={16} /></Link>}>
          {conversations.length === 0 ? (
            <EmptyState icon={MessageCircle} title="No conversations yet" action={{ href: "/search", label: "Find people" }}>
              Search for a friend by username and say hello.
            </EmptyState>
          ) : (
            <ul className="-mx-2 grid">
              {conversations.map((c) => {
                const name = c.kind === "direct" ? c.other_display_name ?? "Someone" : c.title ?? "Untitled";
                const unread = Number(c.unread_count);
                return (
                  <li key={c.id}>
                    <Link href={`/chats/${c.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-surface2">
                      <Avatar name={name} path={c.kind === "direct" ? c.other_avatar_path : c.avatar_path} size={44} online={c.kind === "direct" && online.has(c.other_user_id ?? "")} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-bold">{name}</span>
                        <span className={`block truncate text-sm ${unread ? "font-semibold text-ink" : "text-faint"}`}>{c.last_preview ?? "No messages yet"}</span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <span className="text-xs text-faint">{timeAgo(c.last_message_at)}</span>
                        {unread > 0 && <span className="badge" aria-label={`${unread} unread`}>{unread}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <div className="grid content-start gap-5">
          <Link href="/universe" className="group relative overflow-hidden rounded-[var(--radius-lg)] bg-[linear-gradient(160deg,var(--space-3),var(--space)_75%)] p-5 text-[var(--ink-on-dark)] shadow-[var(--shadow-2)]">
            <span aria-hidden className="absolute -right-10 -top-12 size-44 rounded-full bg-[radial-gradient(circle_at_35%_35%,#8fdcff,#218bcb_55%,#0d2945_80%)] opacity-90" />
            <span aria-hidden className="absolute -right-12 -top-14 size-52 rounded-full border border-white/15" />
            <span className="relative block">
              <span className="eyebrow !text-[#9fc3dd]">Your companion</span>
              <span className="mt-1 block text-xl font-extrabold">{pet?.name ?? "Pip"}</span>
              <span className="text-sm text-[#cfe6f5]">Level {lp.level} · feeling {mood}</span>
              <span className="mt-4 block h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-white/15" role="progressbar" aria-label="Level progress" aria-valuenow={lp.pct} aria-valuemin={0} aria-valuemax={100}>
                <span className="block h-full rounded-full bg-[var(--cyan)]" style={{ width: `${lp.pct}%` }} />
              </span>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-white">
                <Orbit aria-hidden size={16} />Visit your Universe<ChevronRight aria-hidden size={16} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </span>
          </Link>

          <Section title="Streaks" icon={Flame} id="streaks">
            {myStreaks.length === 0 ? (
              <p className="text-sm text-dim">Message a friend and have them reply on the same day to start a streak.</p>
            ) : (
              <ul className="grid gap-2.5">
                {myStreaks.slice(0, 4).map((s) => (
                  <li key={s.partner_id} className="flex items-center gap-3">
                    <Avatar name={s.display_name} path={s.avatar_path} size={34} />
                    <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{s.display_name}</span>
                    <span className="inline-flex items-center gap-1 text-sm font-extrabold text-warm"><Flame aria-hidden size={15} />{s.effective_count}</span>
                    <span className={`chip ${s.status === "at_risk" ? "!text-warm" : s.status === "complete" ? "!text-success" : ""}`}>
                      {s.status === "complete" ? "Done today" : s.status === "at_risk" ? "Say hi today" : "Start again"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <nav aria-label="Explore" className="card grid grid-cols-4 p-2">
        {SHORTCUTS.map(({ href, label, Icon }) => (
          <Link key={href} href={href} className="flex flex-col items-center gap-1.5 rounded-2xl py-3 text-[13px] font-semibold text-dim transition-colors hover:bg-surface2 hover:text-ink">
            <span className="grid size-10 place-items-center rounded-[13px] bg-ice text-brandt"><Icon aria-hidden size={19} /></span>{label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
