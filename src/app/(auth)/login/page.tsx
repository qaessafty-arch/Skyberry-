"use client";
import Link from "next/link";
import { Suspense, useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "@/features/auth-actions";
import { Field, Submit } from "@/components/form-bits";
import { ErrorNote } from "@/components/ui";

function LoginForm() {
  const [state, action] = useActionState(login, {});
  const params = useSearchParams();
  return (
    <form action={action} className="grid gap-4" noValidate>
      <h1 className="text-3xl font-extrabold">Welcome back</h1>
      {params.get("error") === "link" && <ErrorNote>That link expired or was already used. Request a new one.</ErrorNote>}
      {state.error && <ErrorNote>{state.error}</ErrorNote>}
      <input type="hidden" name="next" value={params.get("next") ?? ""} />
      <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
      <Submit>Log in</Submit>
      <p className="text-sm text-dim">
        <Link className="text-berryt underline" href="/forgot-password">Forgot password?</Link> · New here?{" "}
        <Link className="text-berryt underline" href="/register">Create an account</Link>
      </p>
    </form>
  );
}
export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
