"use client";
import { useActionState, useState, useTransition } from "react";
import { ActionButton } from "@/components/action-button";
import { Field, Submit } from "@/components/form-bits";
import { ErrorNote, OkNote } from "@/components/ui";
import { createInviteLink, deleteSpace, inviteToSpace, revokeInviteLink, leaveSpace, removeMember, setRole, transferOwnership, updateSpace } from "@/features/actions";

export function AdminPanel({ id, kind, title, description, visibility }: { id: string; kind: string; title: string; description: string; visibility: string }) {
  const [state, action] = useActionState(updateSpace.bind(null, id), {});
  return (
    <>
      <form action={action} className="card grid gap-4 p-5">
        <h2 className="text-lg font-bold">Details</h2>
        {state.error && <ErrorNote>{state.error}</ErrorNote>}
        {state.ok && <OkNote>{state.message}</OkNote>}
        <Field label="Name" name="title" defaultValue={title} required maxLength={60} error={state.fieldErrors?.title} />
        <Field label="Description" name="description" defaultValue={description} maxLength={500} />
        {kind === "room" ? (
          <div><label htmlFor="vis" className="label">Visibility</label>
            <select id="vis" name="visibility" defaultValue={visibility} className="field">
              <option value="public">Public — anyone can find and join</option><option value="private">Private — invite only</option>
            </select></div>
        ) : <input type="hidden" name="visibility" value="private" />}
        <Submit>Save changes</Submit>
      </form>
      <section className="card flex flex-wrap gap-3 p-5" aria-label="Danger zone">
        <ActionButton className="btn btn-danger btn-sm" confirm="Delete this space and all its messages for everyone? This cannot be undone." action={deleteSpace.bind(null, id)}>Delete space (owner)</ActionButton>
      </section>
    </>
  );
}

export function InvitePanel({ id, friends }: { id: string; friends: { id: string; name: string }[] }) {
  const [sent, setSent] = useState<string[]>([]);
  return (
    <section className="card p-5" aria-labelledby="inv">
      <h2 id="inv" className="mb-3 text-lg font-bold">Invite friends</h2>
      <ul className="grid gap-2">
        {friends.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3">
            <span className="font-bold">{f.name}</span>
            {sent.includes(f.id) ? <span className="chip">Invited</span> :
              <ActionButton action={() => inviteToSpace(id, f.id)} onDone={() => setSent((s) => [...s, f.id])}>Invite</ActionButton>}
          </li>
        ))}
      </ul>
    </section>
  );
}

type Link = { token: string; expires_at: string; max_uses: number; uses: number; revoked: boolean };
export function InviteLinks({ id, links }: { id: string; links: Link[] }) {
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [now] = useState(() => Date.now());
  const url = (t: string) => `${typeof window === "undefined" ? "" : window.location.origin}/join/${t}`;
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(url(t)); setCopied(t); } catch { setCopied(null); } };
  const active = links.filter((l) => !l.revoked && new Date(l.expires_at).getTime() > now && l.uses < l.max_uses);
  return (
    <section className="card p-5" aria-labelledby="links">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="links" className="section-title">Invite links</h2>
        <button className="btn btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { const r = await createInviteLink(id); if (r.ok && r.token) { setFresh(r.token); void copy(r.token); } else setErr(r.error ?? "Couldn't create a link"); })}>Create link</button>
      </div>
      <p className="mb-3 text-sm text-faint">Anyone with a link can join for 7 days, up to 25 people. Revoke a link at any time.</p>
      {err && <p role="alert" className="error-text mb-2">{err}</p>}
      {active.length === 0 && !fresh ? <p className="text-sm text-dim">No active links.</p> : (
        <ul className="grid gap-2">
          {[...new Set([...(fresh ? [fresh] : []), ...active.map((l) => l.token)])].map((t) => {
            const l = active.find((x) => x.token === t);
            return (
              <li key={t} className="panel flex flex-wrap items-center gap-2 p-2.5">
                <code className="min-w-0 flex-1 truncate text-[13px]">{url(t)}</code>
                {l && <span className="chip">{l.uses}/{l.max_uses} used</span>}
                <button className="btn btn-soft btn-sm" onClick={() => void copy(t)}>{copied === t ? "Copied" : "Copy"}</button>
                <ActionButton className="btn btn-ghost btn-sm" action={() => revokeInviteLink(id, t)} onDone={() => { if (fresh === t) setFresh(null); }}>Revoke</ActionButton>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function MemberActions({ conv, user, role, canRole, canRemove, isOwner, assignableAdmin }: {
  conv: string; user: string; role: string; canRole: boolean; canRemove: boolean; isOwner: boolean; assignableAdmin: boolean;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canRole && (
        <>
          <label className="sr-only" htmlFor={`r-${user}`}>Role</label>
          <select id={`r-${user}`} className="field !min-h-9 !w-auto !py-1 text-sm" defaultValue={role} disabled={pending}
            onChange={(e) => start(async () => { const r = await setRole(conv, user, e.target.value); setErr(r.ok ? null : r.error ?? "Failed"); })}>
            {assignableAdmin && <option value="admin">Admin</option>}
            {role === "admin" && !assignableAdmin && <option value="admin" disabled>Admin</option>}
            <option value="moderator">Moderator</option><option value="member">Member</option>
          </select>
        </>
      )}
      {isOwner && <ActionButton className="btn btn-ghost btn-sm" confirm="Make this person the owner? You will become an admin." action={() => transferOwnership(conv, user)}>Make owner</ActionButton>}
      {canRemove && <ActionButton className="btn btn-danger btn-sm" confirm="Remove this member?" action={() => removeMember(conv, user)}>Remove</ActionButton>}
      {err && <span role="alert" className="error-text">{err}</span>}
    </div>
  );
}

export function LeaveButton({ id }: { id: string }) {
  return <ActionButton className="btn btn-danger btn-sm" confirm="Leave this space?" action={() => leaveSpace(id)}>Leave</ActionButton>;
}
