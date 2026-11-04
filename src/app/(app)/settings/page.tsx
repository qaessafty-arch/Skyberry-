import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { profilesById } from "@/lib/queries";
import type { UserSettings } from "@/lib/types";
import { DangerZone, SettingsForm } from "./form";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { supabase, user } = await requireUser();
  const { data } = await supabase.from("user_settings").select("*").eq("user_id", user.id).single();
  const { data: blocks } = await supabase.from("connections").select("addressee_id").eq("requester_id", user.id).eq("status", "blocked");
  const people = await profilesById(supabase, (blocks ?? []).map((b) => b.addressee_id as string));
  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <PageHeader title="Settings" subtitle={user.email ?? undefined} />
      <SettingsForm s={data as UserSettings} />
      <DangerZone blocked={(blocks ?? []).map((b) => ({ id: b.addressee_id as string, name: people.get(b.addressee_id as string)?.display_name ?? "Unknown user" }))} />
    </div>
  );
}
