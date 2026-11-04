import { requireUser } from "@/lib/auth";
import { profilesById } from "@/lib/queries";
import type { Pet, Streak } from "@/lib/types";
import { UniverseClient } from "./client";

export const metadata = { title: "Universe" };

export default async function UniversePage() {
  const { supabase, user } = await requireUser();
  await supabase.rpc("ensure_universe");
  const [{ data: space }, { data: pets }, { data: streaks }, { data: ms }, { data: settings }, { data: conns }] = await Promise.all([
    supabase.from("universe_spaces").select("theme, planet").eq("user_id", user.id).single(),
    supabase.from("pets").select("*"), // RLS: mine + my friends'
    supabase.rpc("my_streaks"),
    supabase.from("milestones").select("key"),
    supabase.from("user_settings").select("reduce_motion").eq("user_id", user.id).single(),
    supabase.from("connections").select("requester_id, addressee_id").eq("status", "accepted"),
  ]);
  const friendIds = (conns ?? []).map((c) => (c.requester_id === user.id ? c.addressee_id : c.requester_id) as string);
  const people = await profilesById(supabase, friendIds);
  const mine = (pets as Pet[] | null)?.find((p) => p.owner_id === user.id);
  const st = (streaks ?? []) as Streak[];
  const friends = friendIds.flatMap((id) => {
    const p = people.get(id); if (!p) return [];
    const pet = (pets as Pet[] | null)?.find((x) => x.owner_id === id);
    return [{ id, name: p.display_name, username: p.username, accent: p.accent, level: Math.floor(Math.sqrt((pet?.xp ?? 0) / 25)) + 1, streak: st.find((s) => s.partner_id === id)?.effective_count ?? 0 }];
  });
  return <UniverseClient space={space ?? { theme: "dusk", planet: "berry" }} pet={mine ?? null} friends={friends} streaks={st}
    earned={(ms ?? []).map((m) => m.key as string)} reduceMotion={Boolean(settings?.reduce_motion)} />;
}
