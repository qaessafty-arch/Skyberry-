"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";
import { safeNext } from "@/lib/safe-redirect";
import { loginSchema, passwordSchema, registerSchema, zodFieldErrors, type ActionState } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

async function clientKey(scope: string) {
  const h = await headers();
  return `${scope}:${h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"}`;
}
const originOf = async () => (await headers()).get("origin") ?? siteUrl;

export async function register(_: ActionState, form: FormData): Promise<ActionState> {
  if (!rateLimit(await clientKey("register"), 8, 60_000)) return { error: "Too many attempts. Try again in a minute." };
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: free } = await supabase.rpc("username_available", { p_username: parsed.data.username });
  if (free === false) return { fieldErrors: { username: "That username is taken" } };
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { username: parsed.data.username, display_name: parsed.data.displayName },
      emailRedirectTo: `${await originOf()}/auth/callback?next=/home`,
    },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/home");
  return { ok: true, message: "Check your inbox to confirm your email, then log in." };
}

export async function login(_: ActionState, form: FormData): Promise<ActionState> {
  if (!rateLimit(await clientKey("login"), 10, 60_000)) return { error: "Too many attempts. Try again in a minute." };
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Email or password is incorrect." };
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(_: ActionState, form: FormData): Promise<ActionState> {
  if (!rateLimit(await clientKey("reset"), 5, 60_000)) return { error: "Too many attempts. Try again in a minute." };
  const parsed = loginSchema.pick({ email: true }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await originOf()}/auth/callback?next=/reset-password`,
  });
  // Same response whether or not the account exists (no account enumeration).
  return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
}

export async function updatePassword(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = passwordSchema.safeParse(form.get("password"));
  if (!parsed.success) return { fieldErrors: { password: parsed.error.issues[0]?.message ?? "Invalid password" } };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { error: error.message };
  redirect("/home");
}
