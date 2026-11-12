import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Welcome } from "./welcome";

export const metadata = { title: "Welcome" };

export default async function WelcomePage() {
  const { supabase, profile } = await requireUser();
  const { data: s } = await supabase.from("user_settings").select("onboarded_at").maybeSingle();
  if (s?.onboarded_at) redirect("/home");
  return <Welcome displayName={profile.display_name} avatarPath={profile.avatar_path} accent={profile.accent} />;
}
