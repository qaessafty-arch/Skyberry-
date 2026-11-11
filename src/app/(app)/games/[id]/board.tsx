"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { ActionButton } from "@/components/action-button";
import { cancelGame, joinGame } from "@/features/actions";
import { winningLine } from "@/lib/games";
import { getBrowserClient } from "@/lib/supabase/client";
import type { GameSession } from "@/lib/types";

export function Board({ initial, meId, names, invitedMe, isPlayer }: { initial: GameSession; meId: string; names: Record<string, string>; invitedMe: boolean; isPlayer: boolean }) {
  const supabase = useMemo(() => getBrowserClient(), []);
  const [g, setG] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [mountedAt] = useState(() => Date.now());

  useEffect(() => {
    const refetch = async () => { const { data } = await supabase.from("game_sessions").select("*").eq("id", initial.id).maybeSingle(); if (data) setG((cur) => (data.version >= cur.version ? (data as GameSession) : cur)); };
    const ch = supabase.channel(`game:${initial.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "game_sessions", filter: `id=eq.${initial.id}` },
        (p: RealtimePostgresChangesPayload<Record<string, unknown>>) => { const n = p.new as unknown as GameSession; setG((cur) => (n.version >= cur.version ? n : cur)); })
      .subscribe((status: string) => { setOnline(status === "SUBSCRIBED"); if (status === "SUBSCRIBED") void refetch(); }); // resync after (re)connect
    const onVis = () => document.visibilityState === "visible" && void refetch();
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); void supabase.removeChannel(ch); };
  }, [supabase, initial.id]);

  async function play(cell: number) {
    setBusy(true); setError(null);
    const { error: err } = await supabase.rpc("make_move", { p_session: g.id, p_cell: cell, p_version: g.version });
    if (err) {
      setError(/stale/i.test(err.message) ? "The board changed. Updated." : /not your turn/i.test(err.message) ? "It's not your turn." : "That move wasn't accepted.");
      const { data } = await supabase.from("game_sessions").select("*").eq("id", g.id).single(); if (data) setG(data as GameSession);
    }
    setBusy(false);
  }
  async function rpc(name: "resign_game" | "claim_forfeit") { const { error: e } = await supabase.rpc(name, { p_session: g.id }); if (e) setError(/claim/i.test(e.message) ? "You can claim a forfeit after 24 hours of inactivity." : "That didn't work."); }

  const marks = g.state.marks;
  const players = Object.keys(marks);
  const line = winningLine(g.state.board);
  const myMark = marks[meId];
  const myTurn = g.status === "active" && g.turn_user === meId;
  const opp = players.find((p) => p !== meId);
  const oppName = opp ? names[opp] : Object.entries(names).find(([id]) => id !== meId)?.[1] ?? "your friend";
  const stale = g.status === "active" && !myTurn && mountedAt - new Date(g.updated_at).getTime() > 24 * 36e5;

  let status = "";
  if (g.status === "waiting") status = invitedMe ? `${names[g.created_by] ?? "A friend"} challenged you.` : `Waiting for ${oppName} to accept…`;
  else if (g.status === "active") status = myTurn ? `Your turn (${myMark})` : `${oppName}'s turn`;
  else if (g.status === "finished") status = g.result === "draw" ? "It's a draw." : g.winner_id === meId ? (g.result === "forfeit" ? "You win by forfeit!" : "You won!") : g.result === "forfeit" ? "You forfeited." : `${names[g.winner_id ?? ""] ?? "Your friend"} won.`;
  else status = "This challenge was cancelled.";

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <header><Link href="/games" className="text-sm font-bold text-brandt">← Games</Link><h1 className="text-[26px] font-extrabold leading-tight">Tic-Tac-Toe</h1>
        <p className="text-dim" role="status" aria-live="polite">{status}</p></header>
      {!online && <p className="chip !text-warm" role="status">Reconnecting… your game is safe on the server.</p>}
      <div role="grid" aria-label="Game board" className="card grid grid-cols-3 gap-2.5 p-3">
        {g.state.board.map((v, i) => (
          <button key={i} role="gridcell" disabled={busy || !myTurn || v !== ""} onClick={() => void play(i)} aria-label={`Cell ${i + 1}${v ? `, ${v}` : ", empty"}`}
            className={`grid aspect-square place-items-center rounded-[18px] border border-line bg-surface2 text-5xl font-extrabold transition-colors enabled:hover:border-sky enabled:hover:bg-white ${line?.includes(i) ? "!border-sky !bg-ice" : ""} ${v === "X" ? "text-brandt" : "text-[#4757c9]"}`}>{v}</button>
        ))}
      </div>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        {g.status === "waiting" && invitedMe && <ActionButton className="btn btn-primary" action={joinGame.bind(null, g.id)}>Accept challenge</ActionButton>}
        {g.status === "waiting" && g.created_by === meId && <ActionButton className="btn btn-ghost" action={cancelGame.bind(null, g.id)}>Cancel</ActionButton>}
        {g.status === "active" && isPlayer && <button className="btn btn-danger btn-sm" onClick={() => window.confirm("Resign this game?") && void rpc("resign_game")}>Resign</button>}
        {stale && <button className="btn btn-soft btn-sm" onClick={() => void rpc("claim_forfeit")}>Claim forfeit (24h idle)</button>}
      </div>
    </div>
  );
}
