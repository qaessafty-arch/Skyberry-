import { requireUser } from "@/lib/auth";
import { profilesById } from "@/lib/queries";
import type { Pet, Streak } from "@/lib/types";
import { UniverseClient } from "./client";

export const metadata = { title: "Universe" };

export default async function UniversePage() {
  const { supabase, user } = await requireUser();
  const [first, { data: streaks }, { data: ms }, { data: settings }, { data: conns }] = await Promise.all([
    Promise.all([
    supabase.from("universe_spaces").select("user_id, theme, planet"), // RLS: mine + my friends'
    supabase.from("pets").select("*"),                                  // RLS: mine + my friends'
    ]),
    supabase.rpc("my_streaks"),
    supabase.from("milestones").select("key"),
    supabase.from("user_settings").select("reduce_motion").eq("user_id", user.id).single(),
    supabase.from("connections").select("requester_id, addressee_id").eq("status", "accepted"),
  ]);
  let [{ data: spaces }, { data: pets }] = first;
  if (!(pets ?? []).some((p) => p.owner_id === user.id)) {
    // first visit: create the space + pet once, then read them back
    await supabase.rpc("ensure_universe");
    [{ data: spaces }, { data: pets }] = await Promise.all([
      supabase.from("universe_spaces").select("user_id, theme, planet"), supabase.from("pets").select("*"),
    ]);
  }
  const friendIds = (conns ?? []).map((c) => (c.requester_id === user.id ? c.addressee_id : c.requester_id) as string);
  const people = await profilesById(supabase, friendIds);
  const allPets = (pets ?? []) as (Pet & { accessory?: string | null })[];
  const mine = allPets.find((p) => p.owner_id === user.id) ?? null;
  const space = spaces?.find((s) => s.user_id === user.id) ?? { theme: "dusk", planet: "berry" };
  const st = (streaks ?? []) as Streak[];
  const friends = friendIds.flatMap((id) => {
    const p = people.get(id); if (!p) return [];
    const pet = allPets.find((x) => x.owner_id === id);
    return [{
      id, name: p.display_name, username: p.username, accent: p.accent,
      level: Math.floor(Math.sqrt((pet?.xp ?? 0) / 25)) + 1, petName: pet?.name ?? "Pip",
      streak: st.find((s) => s.partner_id === id)?.effective_count ?? 0,
      planet: (spaces?.find((s) => s.user_id === id)?.planet as string) ?? "berry",
    }];
  });
  return <UniverseClient space={{ theme: space.theme as string, planet: space.planet as string }} pet={mine} friends={friends} streaks={st}
    earned={(ms ?? []).map((m) => m.key as string)} reduceMotion={Boolean(settings?.reduce_motion)} />;
}
