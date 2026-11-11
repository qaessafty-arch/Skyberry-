import Link from "next/link";
import { Gamepad2, Grid3x3 } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Avatar } from "@/components/avatar";
import { LiveRefresh } from "@/components/live-refresh";
import { EmptyState, PageHeader } from "@/components/ui";
import { startGame } from "@/features/actions";
import { requireUser } from "@/lib/auth";
import { friendsOf, profilesById } from "@/lib/queries";
import type { GameSession } from "@/lib/types";

export const metadata = { title: "Games" };

export default async function GamesPage() {
  const { supabase, user } = await requireUser();
  const [{ data }, friends] = await Promise.all([
    supabase.from("game_sessions").select("*").order("updated_at", { ascending: false }).limit(30), friendsOf(supabase, user.id),
  ]);
  const games = (data ?? []) as GameSession[];
  const { data: parts } = games.length ? await supabase.from("game_participants").select("session_id, user_id").in("session_id", games.map((g) => g.id)) : { data: [] };
  const { data: invs } = games.length ? await supabase.from("game_invites").select("session_id, invitee_id").in("session_id", games.map((g) => g.id)) : { data: [] };
  const people = await profilesById(supabase, [...(parts ?? []).map((p) => p.user_id as string), ...(invs ?? []).map((i) => i.invitee_id as string)]);
  const active = games.filter((g) => g.status === "active" || g.status === "waiting");
  const done = games.filter((g) => g.status === "finished").slice(0, 8);
  const opponent = (g: GameSession) => {
    const id = [...(parts ?? []).filter((p) => p.session_id === g.id).map((p) => p.user_id as string), ...(invs ?? []).filter((i) => i.session_id === g.id).map((i) => i.invitee_id as string)].find((u) => u !== user.id);
    return id ? people.get(id) : undefined;
  };
  return (
    <div className="mx-auto max-w-3xl">
      <LiveRefresh tables={["game_sessions"]} />
      <PageHeader title="Games" subtitle="Turn-based games with friends. Real-time, saved on the server, resume anytime." />
      <section className="card mb-6 p-5" aria-labelledby="ttt">
        <h2 id="ttt" className="mb-1 flex items-center gap-2 text-lg font-bold"><Grid3x3 aria-hidden size={18} className="text-brandt" />Tic-Tac-Toe</h2>
        <p className="mb-3 text-sm text-dim">Challenge a connection. Winning earns your pet XP.</p>
        {friends.length === 0 ? <p className="text-sm text-dim">Connect with a friend first. <Link href="/search" className="font-bold text-brandt">Find people</Link></p> : (
          <ul className="flex flex-wrap gap-2">{friends.map((f) => <li key={f.id}><ActionButton action={startGame.bind(null, f.id)}><Avatar name={f.display_name} path={f.avatar_path} size={22} />{f.display_name}</ActionButton></li>)}</ul>)}
      </section>
      <h2 className="mb-2 text-lg font-bold">Your games</h2>
      {active.length === 0 && done.length === 0 ? <EmptyState icon={Gamepad2} title="No games yet">Pick a friend above to start your first match.</EmptyState> : (
        <ul className="card divide-y divide-line overflow-hidden">
          {[...active, ...done].map((g) => {
            const o = opponent(g);
            const label = g.status === "waiting" ? (g.created_by === user.id ? "Waiting for them" : "Challenge: accept") : g.status === "active" ? (g.turn_user === user.id ? "Your turn" : "Their turn")
              : g.result === "draw" ? "Draw" : g.winner_id === user.id ? "You won" : "You lost";
            return <li key={g.id}><Link href={`/games/${g.id}`} className="flex items-center gap-3 p-4 hover:bg-surface2"><Avatar name={o?.display_name ?? "?"} path={o?.avatar_path} size={40} />
              <span className="flex-1 font-bold">vs {o?.display_name ?? "friend"}</span><span className={`chip ${g.turn_user === user.id && g.status === "active" ? "!text-brandt" : ""}`}>{label}</span></Link></li>;
          })}
        </ul>)}
    </div>
  );
}
