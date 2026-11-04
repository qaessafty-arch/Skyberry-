"use client";
import Link from "next/link";
import { useActionState } from "react";
import { register } from "@/features/auth-actions";
import { Field, Submit } from "@/components/form-bits";
import { ErrorNote, OkNote } from "@/components/ui";

export default function RegisterPage() {
  const [state, action] = useActionState(register, {});
  if (state.ok) {
    return (
      <div className="grid gap-4">
        <h1 className="text-3xl font-extrabold">Almost there</h1>
        <OkNote>{state.message}</OkNote>
        <Link className="btn btn-soft" href="/login">Go to log in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4" noValidate>
      <h1 className="text-3xl font-extrabold">Join Skyberry</h1>
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      <Field label="Display name" name="displayName" autoComplete="name" required error={state.fieldErrors?.displayName} />
      <Field label="Username" name="username" autoComplete="username" required autoCapitalize="none" spellCheck={false}
        hint="Lowercase letters, numbers and underscores" error={state.fieldErrors?.username} />
      <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Field label="Password" name="password" type="password" autoComplete="new-password" required minLength={10}
        hint="At least 10 characters" error={state.fieldErrors?.password} />
      <Submit>Create account</Submit>
      <p className="text-sm text-dim">Already have an account? <Link className="text-berryt underline" href="/login">Log in</Link></p>
    </form>
  );
}
