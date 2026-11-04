"use client";
import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "@/features/auth-actions";
import { Field, Submit } from "@/components/form-bits";
import { ErrorNote, OkNote } from "@/components/ui";

export default function ForgotPasswordPage() {
  const [state, action] = useActionState(requestPasswordReset, {});
  return (
    <form action={action} className="grid gap-4" noValidate>
      <h1 className="text-3xl font-extrabold">Reset your password</h1>
      <p className="text-dim">We&apos;ll email you a link to choose a new one.</p>
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      {state.ok && <OkNote>{state.message}</OkNote>}
      <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Submit>Send reset link</Submit>
      <Link className="text-sm text-berryt underline" href="/login">Back to log in</Link>
    </form>
  );
}
