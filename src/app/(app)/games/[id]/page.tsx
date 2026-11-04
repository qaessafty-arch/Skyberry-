import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { profilesById } from "@/lib/queries";
import type { GameSession } from "@/lib/types";
import { Board } from "./board";

export const metadata = { title: "Tic-Tac-Toe" };

export default async function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("game_sessions").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const [{ data: parts }, { data: invs }] = await Promise.all([
    supabase.from("game_participants").select("user_id, seat").eq("session_id", id),
    supabase.from("game_invites").select("invitee_id").eq("session_id", id),
  ]);
  const ids = [...(parts ?? []).map((p) => p.user_id as string), ...(invs ?? []).map((i) => i.invitee_id as string)];
  const people = await profilesById(supabase, ids);
  const names: Record<string, string> = {};
  ids.forEach((i) => { names[i] = people.get(i)?.display_name ?? "Player"; });
  return <Board initial={data as GameSession} meId={user.id} names={names} invitedMe={(invs ?? []).some((i) => i.invitee_id === user.id)} isPlayer={(parts ?? []).some((p) => p.user_id === user.id)} />;
}
