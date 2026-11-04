"use client";
import { useActionState } from "react";
import { Field, Submit } from "@/components/form-bits";
import { ErrorNote, OkNote } from "@/components/ui";
import { updateProfile } from "@/features/actions";
import type { Profile } from "@/lib/types";

const ACCENTS = ["berry", "sky", "mint", "sun", "violet"] as const;

export function ProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useActionState(updateProfile, {});
  return (
    <form action={action} className="card grid gap-4 p-5" noValidate>
      <h2 className="text-lg font-bold">Edit profile</h2>
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      {state.ok && <OkNote>{state.message}</OkNote>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Display name" name="displayName" defaultValue={profile.display_name} required maxLength={48} error={state.fieldErrors?.displayName} />
        <Field label="Username" name="username" defaultValue={profile.username} required autoCapitalize="none" error={state.fieldErrors?.username} />
      </div>
      <Field label="Status" name="statusText" defaultValue={profile.status_text} maxLength={80} hint="A short line shown on your profile" />
      <div><label htmlFor="bio" className="label">Bio</label>
        <textarea id="bio" name="bio" defaultValue={profile.bio} maxLength={280} rows={3} className="field" /></div>
      <fieldset><legend className="label">Accent colour</legend>
        <div className="flex flex-wrap gap-2">{ACCENTS.map((a) => (
          <label key={a} className="cursor-pointer"><input type="radio" name="accent" value={a} defaultChecked={profile.accent === a} className="peer sr-only" />
            <span className="chip capitalize peer-checked:border-berryt peer-checked:text-ink peer-focus-visible:outline peer-focus-visible:outline-2">{a}</span></label>
        ))}</div></fieldset>
      <div><label htmlFor="visibility" className="label">Who can see your profile</label>
        <select id="visibility" name="visibility" defaultValue={profile.visibility} className="field">
          <option value="public">Everyone</option><option value="friends">Connections only</option><option value="private">Only me (hidden from search)</option>
        </select></div>
      <Submit className="btn btn-primary">Save profile</Submit>
    </form>
  );
}
