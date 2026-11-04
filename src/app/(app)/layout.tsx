import Link from "next/link";
import { Wordmark } from "@/components/logo";
import { BottomNav, SideNav, TopActions } from "@/components/nav";
import { SetupNeeded } from "@/components/setup-needed";
import { isSupabaseConfigured } from "@/lib/env";
import { requireUser } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured) return <SetupNeeded />;
  const { supabase, user } = await requireUser();
  const [{ count }, { data: settings }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.from("user_settings").select("reduce_motion").eq("user_id", user.id).single(),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-[1400px]" data-reduce-motion={settings?.reduce_motion ? "true" : undefined}>
      <SideNav unread={count ?? 0} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-bg/85 px-4 backdrop-blur md:hidden">
          <Link href="/home" aria-label="Skyberry home"><Wordmark /></Link>
          <TopActions userId={user.id} initialUnread={count ?? 0} />
        </header>
        <main id="main" className="px-4 pb-28 pt-5 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
