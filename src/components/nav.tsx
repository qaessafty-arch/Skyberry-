"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Camera, Gamepad2, House, Images, MessageCircle, Orbit, Search, Settings, Star, UserRound, Users, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Wordmark } from "@/components/logo";
import { getBrowserClient } from "@/lib/supabase/client";

type Item = { href: string; label: string; Icon: LucideIcon; fillable?: boolean };
const MAIN: Item[] = [
  { href: "/home", label: "Home", Icon: House, fillable: true },
  { href: "/chats", label: "Chats", Icon: MessageCircle, fillable: true },
  { href: "/camera", label: "Camera", Icon: Camera },
  { href: "/universe", label: "Universe", Icon: Orbit },
  { href: "/profile", label: "Profile", Icon: UserRound, fillable: true },
];
const MORE: Item[] = [
  { href: "/rooms", label: "Rooms", Icon: Users },
  { href: "/games", label: "Games", Icon: Gamepad2 },
  { href: "/saved", label: "Saved", Icon: Star, fillable: true },
  { href: "/gallery", label: "Gallery", Icon: Images },
];
const UTIL: Item[] = [
  { href: "/search", label: "Search", Icon: Search },
  { href: "/notifications", label: "Notifications", Icon: Bell, fillable: true },
  { href: "/settings", label: "Settings", Icon: Settings },
];
const isActive = (path: string, href: string) => path === href || path.startsWith(href + "/");

/** Icon with a consistent active treatment: soft fill + heavier stroke on an ice pill. */
function NavIcon({ Icon, on, fillable, size = 22 }: { Icon: LucideIcon; on: boolean; fillable?: boolean; size?: number }) {
  return <Icon aria-hidden size={size} strokeWidth={on ? 2.3 : 1.9} fill={on && fillable ? "currentColor" : "none"} fillOpacity={on && fillable ? 0.16 : 0} />;
}

/** Warm the Universe's 3D bundle during idle time (no rendering, just the download). */
function usePrefetchUniverse(path: string) {
  useEffect(() => {
    if (path.startsWith("/universe")) return;
    const load = () => { void import("@/components/universe/scene"); };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(load, { timeout: 4000 });
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(load, 2500);
    return () => clearTimeout(t);
  }, [path]);
}

export function BottomNav() {
  const path = usePathname();
  usePrefetchUniverse(path);
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(10px,env(safe-area-inset-bottom))] md:hidden">
      <ul className="glass mx-auto grid h-[var(--nav-h)] max-w-md grid-cols-5 items-center rounded-[22px] px-1.5">
        {MAIN.map(({ href, label, Icon, fillable }) => {
          const on = isActive(path, href);
          const camera = href === "/camera";
          return (
            <li key={href} className="flex justify-center">
              <Link href={href} aria-current={on ? "page" : undefined} aria-label={camera ? "Camera and Moments" : undefined}
                className={`flex min-h-[54px] w-full flex-col items-center justify-center gap-[3px] rounded-2xl text-[11px] font-bold transition-colors ${on ? "text-brandt" : "text-faint hover:text-ink"}`}>
                {camera ? (
                  <span className={`grid size-[42px] place-items-center rounded-[14px] text-white shadow-[0_6px_16px_-8px_rgba(26,120,180,.8)] transition-colors ${on ? "bg-brand-hover" : "bg-brand"}`}>
                    <Icon aria-hidden size={21} strokeWidth={2.1} />
                  </span>
                ) : (
                  <>
                    <span className={`grid h-7 w-12 place-items-center rounded-full transition-colors ${on ? "bg-ice" : ""}`}><NavIcon Icon={Icon} on={on} fillable={fillable} /></span>
                    <span>{label}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function SideLink({ item, path, badge }: { item: Item; path: string; badge?: number }) {
  const on = isActive(path, item.href);
  return (
    <Link href={item.href} aria-current={on ? "page" : undefined}
      className={`group flex min-h-11 items-center gap-3 rounded-[13px] px-3 text-[14.5px] font-semibold transition-colors ${on ? "bg-ice text-brandt" : "text-dim hover:bg-surface2 hover:text-ink"}`}>
      <NavIcon Icon={item.Icon} on={on} fillable={item.fillable} size={20} />
      <span className="flex-1">{item.label}</span>
      {badge ? <span className="badge" aria-label={`${badge} unread`}>{badge > 99 ? "99+" : badge}</span> : null}
    </Link>
  );
}

export function SideNav({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const path = usePathname();
  const unread = useUnread(userId, initialUnread);
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-6 border-r border-line bg-white/55 px-4 py-5 md:flex">
      <Link href="/home" aria-label="Skyberry home" className="px-2"><Wordmark /></Link>
      <nav aria-label="Primary" className="flex flex-1 flex-col gap-6 overflow-y-auto">
        <div className="grid gap-0.5">{MAIN.map((i) => <SideLink key={i.href} item={i} path={path} />)}</div>
        <div className="grid gap-0.5">
          <p className="eyebrow px-3 pb-1">Spaces</p>
          {MORE.map((i) => <SideLink key={i.href} item={i} path={path} />)}
        </div>
        <div className="mt-auto grid gap-0.5">
          {UTIL.map((i) => <SideLink key={i.href} item={i} path={path} badge={i.href === "/notifications" ? unread : undefined} />)}
        </div>
      </nav>
    </aside>
  );
}

/** Mobile header actions: search + live notification count + settings. */
export function TopActions({ userId, initialUnread }: { userId: string; initialUnread: number }) {
  const unread = useUnread(userId, initialUnread);
  return (
    <div className="flex items-center gap-0.5">
      <Link href="/search" aria-label="Search" className="icon-btn"><Search aria-hidden size={20} strokeWidth={1.9} /></Link>
      <Link href="/notifications" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} className="icon-btn relative">
        <Bell aria-hidden size={20} strokeWidth={1.9} />
        {unread > 0 && <span className="badge absolute right-1 top-1 !h-[18px] !min-w-[18px] !px-1 !text-[10px] ring-2 ring-white">{unread > 99 ? "99+" : unread}</span>}
      </Link>
      <Link href="/settings" aria-label="Settings" className="icon-btn"><Settings aria-hidden size={20} strokeWidth={1.9} /></Link>
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
      .channel(`notif:${userId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);
  return unread;
}
