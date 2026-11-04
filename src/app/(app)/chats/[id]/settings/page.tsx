import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Crown, Shield, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { LiveRefresh } from "@/components/live-refresh";
import { requireUser } from "@/lib/auth";
import { friendsOf, profilesById } from "@/lib/queries";
import { AdminPanel, InvitePanel, LeaveButton, MemberActions } from "./panels";

export const metadata = { title: "Group settings" };
const RANK: Record<string, number> = { owner: 4, admin: 3, moderator: 2, member: 1 };
const ROLE_ICON = { owner: Crown, admin: ShieldCheck, moderator: Shield } as const;

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const { data: conv } = await supabase.from("conversations").select("*").eq("id", id).maybeSingle();
  const { data: members } = await supabase.from("conversation_members").select("user_id, role, joined_at").eq("conversation_id", id).order("joined_at");
  if (!conv || conv.kind === "direct" || !members?.some((m) => m.user_id === user.id)) notFound();
  const myRank = RANK[members.find((m) => m.user_id === user.id)!.role as string] ?? 1;
  const people = await profilesById(supabase, members.map((m) => m.user_id as string));
  const friends = (await friendsOf(supabase, user.id)).filter((f) => !members.some((m) => m.user_id === f.id));
  const sorted = [...members].sort((a, b) => (RANK[b.role as string] ?? 0) - (RANK[a.role as string] ?? 0));

  return (
    <div className="mx-auto grid max-w-2xl gap-6">
      <LiveRefresh tables={["conversation_members"]} filter={`conversation_id=eq.${id}`} />
      <header className="flex items-center gap-3">
        <Link href={`/chats/${id}`} aria-label="Back to conversation" className="btn btn-ghost size-11 !p-0"><ArrowLeft aria-hidden size={20} /></Link>
        <div><h1 className="text-2xl font-extrabold">{conv.title}</h1><p className="text-sm text-dim">{conv.kind === "room" ? `${conv.visibility} room` : "Private group"} · {members.length} members</p></div>
      </header>

      {myRank >= 3 && <AdminPanel id={id} kind={conv.kind} title={conv.title} description={conv.description} visibility={conv.visibility} />}
      {myRank >= 2 && friends.length > 0 && <InvitePanel id={id} friends={friends.map((f) => ({ id: f.id, name: f.display_name }))} />}

      <section aria-labelledby="mem" className="card p-5">
        <h2 id="mem" className="mb-3 text-lg font-bold">Members</h2>
        <ul className="grid gap-2">
          {sorted.map((m) => {
            const p = people.get(m.user_id as string);
            const role = m.role as keyof typeof ROLE_ICON | "member";
            const Icon = role === "member" ? null : ROLE_ICON[role];
            const rank = RANK[m.role as string] ?? 1;
            return (
              <li key={m.user_id as string} className="flex flex-wrap items-center gap-3">
                <Avatar name={p?.display_name ?? "?"} path={p?.avatar_path} accent={p?.accent} size={40} />
                <div className="min-w-0 flex-1">
                  <Link href={`/u/${p?.username}`} className="font-bold">{p?.display_name ?? "Member"}</Link>
                  <p className="flex items-center gap-1 text-sm capitalize text-dim">{Icon && <Icon aria-hidden size={14} className="text-sun" />}{m.role as string}</p>
                </div>
                {m.user_id !== user.id && <MemberActions conv={id} user={m.user_id as string} role={m.role as string}
                  canRole={myRank >= 3 && myRank > rank} canRemove={myRank >= 2 && myRank > rank} isOwner={myRank === 4} assignableAdmin={myRank === 4} />}
              </li>
            );
          })}
        </ul>
      </section>
      <div><LeaveButton id={id} /></div>
    </div>
  );
}
