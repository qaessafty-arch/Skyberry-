"use client";
import { useActionState } from "react";
import { Field, Submit } from "@/components/form-bits";
import { ErrorNote, PageHeader } from "@/components/ui";
import { createSpace } from "@/features/actions";

export default function NewRoomPage() {
  const [state, action] = useActionState(createSpace, {});
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Create a room" subtitle="You will be the owner and can add admins and moderators." />
      <form action={action} className="card grid gap-4 p-5" noValidate>
        {state.error && <ErrorNote>{state.error}</ErrorNote>}
        <input type="hidden" name="kind" value="room" />
        <Field label="Room name" name="title" required maxLength={60} error={state.fieldErrors?.title} />
        <Field label="Description" name="description" maxLength={500} hint="What is this room about?" />
        <div><label htmlFor="visibility" className="label">Visibility</label>
          <select id="visibility" name="visibility" className="field" defaultValue="public">
            <option value="public">Public — appears in Rooms, anyone can join</option>
            <option value="private">Private — invite only</option>
          </select></div>
        <Submit>Create room</Submit>
      </form>
    </div>
  );
}
