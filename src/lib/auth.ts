import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * Signed-in user for server components, or redirect to /login.
 * `getClaims()` verifies the session JWT's signature locally against the project's published
 * signing keys (no round trip to the Auth server on every page). Data access is still
 * enforced by RLS in Postgres. Mutations in route handlers/actions keep using getUser().
 */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) redirect("/login");
  const user = { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) redirect("/login");
  return { supabase, user, profile: profile as Profile };
});
