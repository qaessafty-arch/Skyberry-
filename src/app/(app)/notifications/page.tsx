import Link from "next/link";
import { Award, Bell, Camera, Flame, Gamepad2, MessageCircle, UserCheck, UserPlus, Users, type LucideIcon } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Avatar } from "@/components/avatar";
import { LiveRefresh } from "@/components/live-refresh";
import { EmptyState, PageHeader } from "@/components/ui";
import { markNotificationsRead, respondInvite, respondRequest } from "@/features/actions";
import { requireUser } from "@/lib/auth";
import { hoursAgo, timeAgo } from "@/lib/format";
import { profilesById } from "@/lib/queries";
import type { NotificationRow } from "@/lib/types";

export const metadata = { title: "Notifications" };

// One icon + tint per category, never emoji.
const KIND: Record<string, { Icon: LucideIcon; label: string; tint: string }> = {
  message: { Icon: MessageCircle, label: "Message", tint: "bg-ice text-brandt" },
  connection_request: { Icon: UserPlus, label: "Connection request", tint: "bg-[#e6ecff] text-[#4757c9]" },
  connection_accepted: { Icon: UserCheck, label: "Connection", tint: "bg-[#e3f6f1] text-success" },
  invite: { Icon: Users, label: "Invite", tint: "bg-[#e6ecff] text-[#4757c9]" },
  game_invite: { Icon: Gamepad2, label: "Game", tint: "bg-ice text-brandt" },
  moment: { Icon: Camera, label: "Moment", tint: "bg-ice text-brandt" },
  milestone: { Icon: Award, label: "Milestone", tint: "bg-[#fff2df] text-warm" },
  streak: { Icon: Flame, label: "Streak", tint: "bg-[#fff2df] text-warm" },
};

export default async function NotificationsPage() {
  const { supabase, user } = await requireUser();
  const [{ data }, { data: invites }, { data: reqs }] = await Promise.all([
    supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(60),
    supabase.from("conversation_invites").select("id, conversation_id, inviter_id").eq("invitee_id", user.id).eq("status", "pending"),
    supabase.from("connections").select("id, requester_id").eq("addressee_id", user.id).eq("status", "pending"),
  ]);
  const rows = (data ?? []) as NotificationRow[];
  const people = await profilesById(supabase, [...rows.map((r) => r.actor_id ?? ""), ...(invites ?? []).map((i) => i.inviter_id as string), ...(reqs ?? []).map((r) => r.requester_id as string)]);
  const unread = rows.filter((r) => !r.read_at).length;
  const convTitles = new Map<string, string>();
  if (invites?.length) {
    const { data: cs } = await supabase.from("conversations").select("id, title").in("id", invites.map((i) => i.conversation_id as string));
    cs?.forEach((c) => convTitles.set(c.id, c.title ?? "a space"));
  }
  const dayAgo = hoursAgo(24);
  const groups = [
    { title: "Today", items: rows.filter((r) => new Date(r.created_at).getTime() >= dayAgo) },
    { title: "Earlier", items: rows.filter((r) => new Date(r.created_at).getTime() < dayAgo) },
  ].filter((g) => g.items.length);
  const pending = (reqs?.length ?? 0) + (invites?.length ?? 0);

  return (
    <div className="mx-auto max-w-2xl rise">
      <LiveRefresh tables={["notifications"]} filter={`user_id=eq.${user.id}`} />
      <PageHeader title="Notifications" subtitle={unread ? `${unread} unread` : "You're up to date"}
        actions={unread > 0 ? <ActionButton className="btn btn-soft btn-sm" action={markNotificationsRead.bind(null, undefined)}>Mark all read</ActionButton> : undefined} />

      {pending > 0 && (
        <section aria-labelledby="pend" className="card mb-5 p-4 sm:p-5">
          <h2 id="pend" className="section-title mb-3">Waiting for you</h2>
          <ul className="grid gap-3">
            {reqs?.map((r) => { const p = people.get(r.requester_id as string); return (
              <li key={r.id} className="flex flex-wrap items-center gap-3">
                <Avatar name={p?.display_name ?? "?"} path={p?.avatar_path} accent={p?.accent} size={42} />
                <span className="min-w-0 flex-1 text-[15px]"><b>{p?.display_name}</b> <span className="text-dim">wants to connect</span></span>
                <div className="flex gap-2">
                  <ActionButton className="btn btn-primary btn-sm" action={respondRequest.bind(null, r.id as string, true)}>Accept</ActionButton>
                  <ActionButton className="btn btn-ghost btn-sm" action={respondRequest.bind(null, r.id as string, false)}>Decline</ActionButton>
                </div>
              </li>); })}
            {invites?.map((i) => { const p = people.get(i.inviter_id as string); return (
              <li key={i.id} className="flex flex-wrap items-center gap-3">
                <span className="grid size-[42px] place-items-center rounded-full bg-[#e6ecff] text-[#4757c9]"><Users aria-hidden size={19} /></span>
                <span className="min-w-0 flex-1 text-[15px]"><b>{p?.display_name}</b> <span className="text-dim">invited you to</span> <b>{convTitles.get(i.conversation_id as string) ?? "a space"}</b></span>
                <div className="flex gap-2">
                  <ActionButton className="btn btn-primary btn-sm" action={respondInvite.bind(null, i.id as string, true)}>Join</ActionButton>
                  <ActionButton className="btn btn-ghost btn-sm" action={respondInvite.bind(null, i.id as string, false)}>Decline</ActionButton>
                </div>
              </li>); })}
          </ul>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="card"><EmptyState icon={Bell} title="You're all caught up">Messages, requests, invites, game challenges and milestones show up here. Choose which ones in Settings.</EmptyState></div>
      ) : groups.map((g) => (
        <section key={g.title} aria-label={g.title} className="mb-5">
          <h2 className="eyebrow mb-2 px-1">{g.title}</h2>
          <ul className="card overflow-hidden p-1.5">
            {g.items.map((n) => {
              const a = n.actor_id ? people.get(n.actor_id) : undefined;
              const k = KIND[n.kind] ?? { Icon: Bell, label: "Update", tint: "bg-ice text-brandt" };
              return (
                <li key={n.id}>
                  <Link href={n.link ?? "/home"} className={`flex items-center gap-3 rounded-[16px] p-3 transition-colors hover:bg-surface2 ${n.read_at ? "" : "bg-[#f2f9fe]"}`}>
                    <span className="relative shrink-0">
                      {a ? <Avatar name={a.display_name} path={a.avatar_path} accent={a.accent} size={42} />
                        : <span className={`grid size-[42px] place-items-center rounded-full ${k.tint}`}><k.Icon aria-hidden size={19} /></span>}
                      {a && <span className={`absolute -bottom-1 -right-1 grid size-[22px] place-items-center rounded-full ring-2 ring-white ${k.tint}`}><k.Icon aria-label={k.label} size={12} strokeWidth={2.4} /></span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[14.5px]"><b>{a?.display_name ?? "Skyberry"}</b>{n.kind === "message" ? <span className="text-dim">: {n.body}</span> : <span className="text-dim"> {n.body}</span>}</span>
                      <span className="text-xs text-faint">{k.label} · {timeAgo(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span aria-label="Unread" className="size-2.5 shrink-0 rounded-full bg-sky" />}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
