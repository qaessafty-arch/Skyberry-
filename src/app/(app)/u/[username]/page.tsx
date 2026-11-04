import { notFound } from "next/navigation";
import { Lock, MessageCircle, UserCheck, UserMinus, UserPlus, Ban, Gamepad2 } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Avatar } from "@/components/avatar";
import { blockUser, openDirect, removeConnection, respondRequest, sendRequest, startGame } from "@/features/actions";
import { requireUser } from "@/lib/auth";
import { avatarUrl } from "@/lib/format";
import type { Profile } from "@/lib/types";

export default async function PublicProfile({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  if (!/^[a-z0-9_]{3,24}$/.test(username)) notFound();
  const { supabase, user } = await requireUser();
  // RLS decides whether this row is visible to the viewer; "hidden" and "missing" look identical.
  const { data } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (!data) notFound();
  const p = data as Profile;
  const mine = p.id === user.id;
  const { data: conn } = mine ? { data: null } : await supabase.from("connections").select("id, requester_id, status").or(`requester_id.eq.${p.id},addressee_id.eq.${p.id}`).maybeSingle();
  const banner = avatarUrl(p.banner_path);

  return (
    <div className="mx-auto max-w-2xl">
      <article className="card overflow-hidden">
        <div className="h-36 bg-gradient-to-br from-berry/60 via-violet/40 to-sky/40 bg-cover bg-center" style={banner ? { backgroundImage: `url(${banner})` } : undefined} />
        <div className="-mt-12 px-6 pb-6">
          <Avatar name={p.display_name} path={p.avatar_path} accent={p.accent} size={96} className="ring-4 ring-surface" />
          <h1 className="mt-3 text-3xl font-extrabold">{p.display_name}</h1>
          <p className="text-dim">@{p.username} {p.visibility !== "public" && <span className="chip ml-1"><Lock aria-hidden size={12} />{p.visibility === "friends" ? "Connections only" : "Private"}</span>}</p>
          {p.status_text && <p className="mt-2 font-semibold">{p.status_text}</p>}
          {p.bio && <p className="mt-2 whitespace-pre-wrap text-dim">{p.bio}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            {mine ? <a href="/profile" className="btn btn-soft">Edit profile</a> : conn?.status === "accepted" ? (
              <>
                <ActionButton className="btn btn-primary" action={openDirect.bind(null, p.id)}><MessageCircle aria-hidden size={16} />Message</ActionButton>
                <ActionButton className="btn btn-soft" action={startGame.bind(null, p.id)}><Gamepad2 aria-hidden size={16} />Challenge</ActionButton>
                <ActionButton className="btn btn-ghost" confirm={`Remove ${p.display_name} from your connections?`} action={removeConnection.bind(null, p.id)}><UserMinus aria-hidden size={16} />Remove</ActionButton>
              </>
            ) : conn?.status === "pending" ? (
              conn.requester_id === user.id ? <span className="chip"><UserCheck aria-hidden size={14} />Request sent</span> : (
                <><ActionButton className="btn btn-primary" action={respondRequest.bind(null, conn.id as string, true)}>Accept request</ActionButton>
                  <ActionButton className="btn btn-ghost" action={respondRequest.bind(null, conn.id as string, false)}>Decline</ActionButton></>)
            ) : (
              <>
                <ActionButton className="btn btn-primary" action={sendRequest.bind(null, p.id)}><UserPlus aria-hidden size={16} />Connect</ActionButton>
                <ActionButton className="btn btn-soft" action={openDirect.bind(null, p.id)}><MessageCircle aria-hidden size={16} />Message</ActionButton>
              </>
            )}
            {!mine && <ActionButton className="btn btn-ghost" confirm={`Block ${p.display_name}? They won't be able to find or message you.`} action={blockUser.bind(null, p.id)}><Ban aria-hidden size={16} />Block</ActionButton>}
          </div>
        </div>
      </article>
    </div>
  );
}
