"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Camera, Gamepad2, Home, Images, MessageCircle, Orbit, Search, Settings, Star, User, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/logo";
import { getBrowserClient } from "@/lib/supabase/client";

const MAIN = [
  { href: "/home", label: "Home", Icon: Home },
  { href: "/chats", label: "Chats", Icon: MessageCircle },
  { href: "/camera", label: "Camera", Icon: Camera, hero: true },
  { href: "/universe", label: "Universe", Icon: Orbit },
  { href: "/profile", label: "Profile", Icon: User },
];
const MORE = [
  { href: "/rooms", label: "Rooms", Icon: Users },
  { href: "/games", label: "Games", Icon: Gamepad2 },
  { href: "/saved", label: "Saved", Icon: Star },
  { href: "/gallery", label: "Gallery", Icon: Images },
  { href: "/search", label: "Search", Icon: Search },
  { href: "/notifications", label: "Notifications", Icon: Bell },
  { href: "/settings", label: "Settings", Icon: Settings },
];
const active = (path: string, href: string) => path === href || path.startsWith(href + "/");

export function BottomNav() {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5 items-end px-2">
        {MAIN.map(({ href, label, Icon, hero }) => {
          const on = active(path, href);
          return (
            <li key={href}>
              <Link href={href} aria-current={on ? "page" : undefined}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${on ? "text-berryt" : "text-dim"}`}>
                {hero ? (
                  <span className="-mt-5 grid size-14 place-items-center rounded-full bg-berry text-white shadow-[0_8px_24px_-6px_var(--berry-glow)] ring-4 ring-bg">
                    <Icon aria-hidden size={24} />
                  </span>
                ) : <Icon aria-hidden size={22} strokeWidth={on ? 2.6 : 2} />}
                <span className={hero ? "sr-only" : ""}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function SideNav({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Primary" className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 overflow-y-auto border-r border-line p-4 md:flex">
      <Link href="/home" aria-label="Skyberry home" className="mb-4 px-3 pt-2"><Wordmark /></Link>
      {[...MAIN, ...MORE].map(({ href, label, Icon }) => {
        const on = active(path, href);
        return (
          <Link key={href} href={href} aria-current={on ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-bold transition-colors ${on ? "bg-surface2 text-ink" : "text-dim hover:bg-surface hover:text-ink"}`}>
            <Icon aria-hidden size={20} className={on ? "text-berryt" : ""} />
            {label}
            {href === "/notifications" && unread > 0 && <span className="ml-auto rounded-full bg-berry px-2 text-xs text-white">{unread}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Mobile top-right shortcuts (search + live notification count). */
export function TopActions({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const unread = useUnread(userId, initialUnread);
  return (
    <div className="flex items-center gap-1">
      <Link href="/search" aria-label="Search" className="btn btn-ghost size-11 !p-0"><Search aria-hidden size={20} /></Link>
      <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="btn btn-ghost relative size-11 !p-0">
        <Bell aria-hidden size={20} />
        {unread > 0 && <span className="absolute right-1 top-1 grid min-w-5 place-items-center rounded-full bg-berry px-1 text-[11px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
      </Link>
      <Link href="/settings" aria-label="Settings" className="btn btn-ghost size-11 !p-0"><Settings aria-hidden size={20} /></Link>
    </div>
  );
}

export function useUnread(userId: string, initial: number) {
  const [unread, setUnread] = useState(initial);
  useEffect(() => {
    const supabase = getBrowserClient();
    const refresh = async () => {
      const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null);
      setUnread(count ?? 0);
    };
    const channel = supabase
      .channel(`notif:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);
  return unread;
}
