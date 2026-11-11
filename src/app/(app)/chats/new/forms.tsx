"use client";
import Link from "next/link";
import { useActionState, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { Field, Submit } from "@/components/form-bits";
import { ErrorNote } from "@/components/ui";
import { createSpace, openDirect } from "@/features/actions";

type F = { id: string; name: string; username: string; avatar: string | null; accent: string };

export function NewChatForms({ friends }: { friends: F[] }) {
  const [state, action] = useActionState(createSpace, {});
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="grid gap-6">
      <section className="card p-5" aria-labelledby="dm">
        <h2 id="dm" className="mb-3 text-lg font-bold">Message a friend</h2>
        {err && <ErrorNote>{err}</ErrorNote>}
        {friends.length === 0 ? (
          <p className="text-sm text-dim">You haven&apos;t connected with anyone yet. <Link href="/search" className="font-bold text-brandt">Find people</Link> to message.</p>
        ) : (
          <ul className="grid gap-1">
            {friends.map((f) => (
              <li key={f.id}>
                <button type="button" disabled={pending} className="flex w-full items-center gap-3 rounded-2xl p-2 text-left hover:bg-surface2"
                  onClick={() => start(async () => { const r = await openDirect(f.id); if (r && !r.ok) setErr(r.error ?? "Could not open the chat"); })}>
                  <Avatar name={f.name} path={f.avatar} accent={f.accent} /><span><b>{f.name}</b><span className="block text-sm text-dim">@{f.username}</span></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form action={action} className="card grid gap-4 p-5" aria-labelledby="grp">
        <h2 id="grp" className="text-lg font-bold">Create a group</h2>
        {state.error && <ErrorNote>{state.error}</ErrorNote>}
        <input type="hidden" name="kind" value="group" />
        <input type="hidden" name="visibility" value="private" />
        <Field label="Group name" name="title" required maxLength={60} error={state.fieldErrors?.title} />
        <Field label="Description (optional)" name="description" maxLength={500} />
        {friends.length > 0 && (
          <fieldset className="grid gap-2">
            <legend className="label">Invite friends</legend>
            {friends.map((f) => (
              <label key={f.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 hover:bg-surface2">
                <input type="checkbox" name="invitee" value={f.id} className="size-5 accent-[var(--brand)]" />
                <Avatar name={f.name} path={f.avatar} accent={f.accent} size={32} />{f.name}
              </label>
            ))}
          </fieldset>
        )}
        <Submit>Create group</Submit>
      </form>
    </div>
  );
}
