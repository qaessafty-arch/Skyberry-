import Link from "next/link";
import { Link2Off, Users } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import { Avatar } from "@/components/avatar";
import { joinByLink } from "@/features/actions";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Join" };

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase } = await requireUser();
  const valid = /^[0-9a-f]{32}$/.test(token);
  const { data } = valid ? await supabase.rpc("invite_link_preview", { p_token: token }) : { data: null };
  const c = (data as { conversation_id: string; title: string; description: string; member_count: number; kind: string; already_member: boolean }[] | null)?.[0];
  return (
    <div className="mx-auto grid max-w-md gap-4 pt-6 rise">
      {!c ? (
        <div className="card grid justify-items-center gap-3 p-8 text-center">
          <span className="grid size-12 place-items-center rounded-2xl bg-ice text-brandt"><Link2Off aria-hidden size={22} /></span>
          <h1 className="text-[22px] font-extrabold">This invite link isn&apos;t valid</h1>
          <p className="text-dim">It may have expired, reached its limit or been revoked. Ask for a new link.</p>
          <Link href="/home" className="btn btn-soft">Go home</Link>
        </div>
      ) : (
        <div className="card grid justify-items-center gap-3 p-8 text-center">
          <Avatar name={c.title} size={72} ring />
          <p className="eyebrow">You&apos;re invited to a {c.kind === "room" ? "room" : "group"}</p>
          <h1 className="text-[24px] font-extrabold leading-tight">{c.title}</h1>
          {c.description && <p className="text-dim">{c.description}</p>}
          <p className="chip"><Users aria-hidden size={13} />{c.member_count} member{c.member_count === 1 ? "" : "s"}</p>
          {c.already_member ? <Link className="btn btn-primary" href={`/chats/${c.conversation_id}`}>Open</Link>
            : <ActionButton className="btn btn-primary" action={joinByLink.bind(null, token)}>Join {c.kind === "room" ? "room" : "group"}</ActionButton>}
        </div>
      )}
    </div>
  );
}
