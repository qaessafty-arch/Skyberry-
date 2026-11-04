"use client";
import { useActionState } from "react";
import { updatePassword } from "@/features/auth-actions";
import { Field, Submit } from "@/components/form-bits";
import { ErrorNote } from "@/components/ui";
import { Wordmark } from "@/components/logo";

export default function ResetPasswordPage() {
  const [state, action] = useActionState(updatePassword, {});
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md content-center gap-6 px-4 py-10">
      <Wordmark />
      <form action={action} className="card grid gap-4 p-6 sm:p-8" noValidate>
        <h1 className="text-3xl font-extrabold">Choose a new password</h1>
        {state.error && <ErrorNote>{state.error}</ErrorNote>}
        <Field label="New password" name="password" type="password" autoComplete="new-password" required minLength={10}
          error={state.fieldErrors?.password} hint="At least 10 characters" />
        <Submit>Update password</Submit>
      </form>
    </main>
  );
}
