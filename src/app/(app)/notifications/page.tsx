import Link from "next/link";
import { Bell } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Avatar } from "@/components/avatar";
import { LiveRefresh } from "@/components/live-refresh";
import { EmptyState, PageHeader } from "@/components/ui";
import { markNotificationsRead, respondInvite, respondRequest } from "@/features/actions";
import { requireUser } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import { profilesById } from "@/lib/queries";
import type { NotificationRow } from "@/lib/types";

export const metadata = { title: "Notifications" };

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
  return (
    <div className="mx-auto max-w-2xl">
      <LiveRefresh tables={["notifications"]} filter={`user_id=eq.${user.id}`} />
      <PageHeader title="Notifications" actions={unread > 0 ? <ActionButton action={markNotificationsRead.bind(null, undefined)}>Mark all read</ActionButton> : undefined} />
      {((invites?.length ?? 0) > 0 || (reqs?.length ?? 0) > 0) && (
        <section className="card mb-5 p-5" aria-labelledby="pend"><h2 id="pend" className="mb-3 text-lg font-bold">Waiting for you</h2>
          <ul className="grid gap-3">
            {reqs?.map((r) => { const p = people.get(r.requester_id as string); return (
              <li key={r.id} className="flex flex-wrap items-center gap-3"><Avatar name={p?.display_name ?? "?"} path={p?.avatar_path} size={40} />
                <span className="min-w-0 flex-1"><b>{p?.display_name}</b> wants to connect</span>
                <ActionButton className="btn btn-primary btn-sm" action={respondRequest.bind(null, r.id as string, true)}>Accept</ActionButton>
                <ActionButton className="btn btn-ghost btn-sm" action={respondRequest.bind(null, r.id as string, false)}>Decline</ActionButton></li>); })}
            {invites?.map((i) => { const p = people.get(i.inviter_id as string); return (
              <li key={i.id} className="flex flex-wrap items-center gap-3"><Avatar name={p?.display_name ?? "?"} path={p?.avatar_path} size={40} />
                <span className="min-w-0 flex-1"><b>{p?.display_name}</b> invited you to <b>{convTitles.get(i.conversation_id as string) ?? "a space"}</b></span>
                <ActionButton className="btn btn-primary btn-sm" action={respondInvite.bind(null, i.id as string, true)}>Join</ActionButton>
                <ActionButton className="btn btn-ghost btn-sm" action={respondInvite.bind(null, i.id as string, false)}>Decline</ActionButton></li>); })}
          </ul></section>
      )}
      {rows.length === 0 ? <EmptyState icon={Bell} title="You're all caught up">New messages, requests, invites and milestones will show up here. You choose which ones in Settings.</EmptyState> : (
        <ul className="card divide-y divide-line overflow-hidden">
          {rows.map((n) => {
            const a = n.actor_id ? people.get(n.actor_id) : undefined;
            return (
              <li key={n.id}>
                <Link href={n.link ?? "/home"} className={`flex items-center gap-3 p-4 hover:bg-surface2 ${n.read_at ? "" : "bg-surface2/60"}`}>
                  {a ? <Avatar name={a.display_name} path={a.avatar_path} size={40} /> : <span className="grid size-10 place-items-center rounded-full bg-surface2 text-berryt"><Bell aria-hidden size={18} /></span>}
                  <span className="min-w-0 flex-1"><span className="block truncate"><b>{a?.display_name ?? "Skyberry"}</b> {n.body}</span><span className="text-xs text-faint">{timeAgo(n.created_at)}</span></span>
                  {!n.read_at && <span aria-label="Unread" className="size-2.5 rounded-full bg-berry" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
