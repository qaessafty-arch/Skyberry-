"use client";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { Submit } from "@/components/form-bits";
import { ErrorNote, OkNote } from "@/components/ui";
import { unblockUser, updateSettings } from "@/features/actions";
import type { UserSettings } from "@/lib/types";

function Toggle({ name, label, hint, on }: { name: string; label: string; hint?: string; on: boolean }) {
  return (
    <label className="flex min-h-12 items-center justify-between gap-4 rounded-2xl px-1 py-2">
      <span><span className="block font-bold">{label}</span>{hint && <span className="text-sm text-dim">{hint}</span>}</span>
      <input type="checkbox" role="switch" name={name} defaultChecked={on} className="h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-line transition-colors checked:bg-berry relative
        after:absolute after:left-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:transition-transform checked:after:translate-x-5" />
    </label>
  );
}

export function SettingsForm({ s }: { s: UserSettings }) {
  const [state, action] = useActionState(updateSettings, {});
  return (
    <form action={action} className="card grid gap-2 p-5">
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      {state.ok && <OkNote>{state.message}</OkNote>}
      <h2 className="text-lg font-bold">Privacy</h2>
      <div><label htmlFor="wcm" className="label">Who can start a conversation with you</label>
        <select id="wcm" name="who_can_message" defaultValue={s.who_can_message} className="field">
          <option value="everyone">Everyone</option><option value="friends">Connections only</option></select></div>
      <h2 className="mt-4 text-lg font-bold">Notifications</h2>
      <Toggle name="notify_messages" label="Messages" hint="One notification per conversation until you read it" on={s.notify_messages} />
      <Toggle name="notify_connections" label="Connection requests" on={s.notify_connections} />
      <Toggle name="notify_rooms" label="Room and group invites" on={s.notify_rooms} />
      <Toggle name="notify_moments" label="Friends' Moments" on={s.notify_moments} />
      <Toggle name="notify_games" label="Game challenges" on={s.notify_games} />
      <Toggle name="notify_milestones" label="Milestones and streaks" on={s.notify_milestones} />
      <h2 className="mt-4 text-lg font-bold">Streaks & comfort</h2>
      <Toggle name="streaks_enabled" label="Track streaks" hint="Turning this off stops tracking for both people in a pair" on={s.streaks_enabled} />
      <Toggle name="show_streaks" label="Show my streaks" on={s.show_streaks} />
      <Toggle name="reduce_motion" label="Reduce motion" hint="Calms animations and the 3D Universe" on={s.reduce_motion} />
      <Submit className="btn btn-primary mt-3">Save settings</Submit>
    </form>
  );
}

export function DangerZone({ blocked }: { blocked: { id: string; name: string }[] }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  return (
    <>
      <section className="card p-5" aria-labelledby="bl"><h2 id="bl" className="mb-3 text-lg font-bold">Blocked people</h2>
        {blocked.length === 0 ? <p className="text-sm text-dim">You haven&apos;t blocked anyone.</p> : (
          <ul className="grid gap-2">{blocked.map((b) => <li key={b.id} className="flex items-center justify-between"><span className="font-bold">{b.name}</span><ActionButton action={unblockUser.bind(null, b.id)}>Unblock</ActionButton></li>)}</ul>)}
      </section>
      <section className="card p-5" aria-labelledby="del"><h2 id="del" className="mb-1 text-lg font-bold">Delete account</h2>
        <p className="mb-3 text-sm text-dim">Permanently removes your profile, messages you sent are anonymised, and your uploaded files and Moments are deleted.</p>
        {err && <ErrorNote>{err}</ErrorNote>}
        <button className="btn btn-danger" onClick={async () => {
          if (!window.confirm("Delete your account permanently? This cannot be undone.")) return;
          const res = await fetch("/api/account", { method: "DELETE" });
          if (res.ok) router.replace("/"); else setErr("We couldn't delete your account. Please try again or contact support.");
        }}>Delete my account</button>
      </section>
    </>
  );
}
