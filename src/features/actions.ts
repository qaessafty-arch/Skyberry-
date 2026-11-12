"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { profileSchema, settingsSchema, spaceSchema, uuidSchema, zodFieldErrors, type ActionState } from "@/lib/validation";

type Result = { ok: boolean; error?: string };
const fail = (e: { message: string }): Result => ({ ok: false, error: friendly(e.message) });
/** Database rule violations are written for humans; hide anything unexpected. */
function friendly(message: string) {
  const known = [/slow down/i, /too many/i, /only accepts/i, /transfer ownership/i, /not allowed/i, /only the owner/i, /cooldown|content for now/i,
    /you can only challenge/i, /finish or cancel/i, /not your turn/i, /cell taken/i, /stale state/i, /choose at least/i, /unavailable/i, /cannot/i];
  return known.some((r) => r.test(message)) ? message : "Something went wrong. Please try again.";
}

async function call(name: string, args: Record<string, unknown>, paths: string[] = []): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(name, args);
  if (error) return fail(error);
  paths.forEach((p) => revalidatePath(p));
  return { ok: true };
}
const id = (v: string) => uuidSchema.parse(v);

// ── connections ──
export const sendRequest = async (target: string) => call("request_connection", { p_target: id(target) }, ["/home", "/search", "/profile"]);
export const respondRequest = async (connectionId: string, accept: boolean) =>
  call("respond_connection", { p_id: id(connectionId), p_accept: accept }, ["/home", "/notifications", "/profile"]);
export const removeConnection = async (other: string) => call("remove_connection", { p_other: id(other) }, ["/profile", "/home"]);
export const blockUser = async (target: string) => call("block_user", { p_target: id(target) }, ["/profile", "/home", "/chats"]);
export const unblockUser = async (target: string) => call("unblock_user", { p_target: id(target) }, ["/settings"]);

// ── conversations ──
export async function openDirect(other: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_direct_conversation", { p_other: id(other) });
  if (error) return fail(error);
  redirect(`/chats/${data}`);
}

export async function createSpace(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = spaceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const invitees = form.getAll("invitee").map(String).filter((v) => uuidSchema.safeParse(v).success);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_conversation", {
    p_kind: parsed.data.kind, p_title: parsed.data.title, p_description: parsed.data.description,
    p_visibility: parsed.data.kind === "group" ? "private" : parsed.data.visibility, p_invitees: invitees,
  });
  if (error) return { error: friendly(error.message) };
  redirect(`/chats/${data}`);
}

export async function joinRoom(conv: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_room", { p_conv: id(conv) });
  if (error) return fail(error);
  redirect(`/chats/${conv}`);
}
export const respondInvite = async (invite: string, accept: boolean) => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("respond_invite", { p_invite: id(invite), p_accept: accept });
  if (error) return fail(error);
  revalidatePath("/notifications");
  if (accept) redirect(`/chats/${data}`);
  return { ok: true } as Result;
};
export async function leaveSpace(conv: string) {
  const r = await call("leave_conversation", { p_conv: id(conv) }, ["/chats"]);
  if (r.ok) redirect("/chats");
  return r;
}
export const inviteToSpace = async (conv: string, invitee: string) =>
  call("invite_to_conversation", { p_conv: id(conv), p_invitee: id(invitee) }, [`/chats/${conv}/settings`]);
export const setRole = async (conv: string, user: string, role: string) =>
  call("set_member_role", { p_conv: id(conv), p_user: id(user), p_role: z.enum(["admin", "moderator", "member"]).parse(role) }, [`/chats/${conv}/settings`]);
export const removeMember = async (conv: string, user: string) =>
  call("remove_member", { p_conv: id(conv), p_user: id(user) }, [`/chats/${conv}/settings`]);
export const transferOwnership = async (conv: string, user: string) =>
  call("transfer_ownership", { p_conv: id(conv), p_new_owner: id(user) }, [`/chats/${conv}/settings`]);
export async function deleteSpace(conv: string) {
  const r = await call("delete_conversation", { p_conv: id(conv) }, ["/chats", "/rooms"]);
  if (r.ok) redirect("/chats");
  return r;
}
export async function updateSpace(conv: string, _: ActionState, form: FormData): Promise<ActionState> {
  const parsed = spaceSchema.pick({ title: true, description: true, visibility: true }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const r = await call("update_conversation_info", {
    p_conv: id(conv), p_title: parsed.data.title, p_description: parsed.data.description, p_visibility: parsed.data.visibility,
  }, [`/chats/${conv}/settings`, "/rooms"]);
  return r.ok ? { ok: true, message: "Saved" } : { error: r.error };
}
export const moderateDelete = async (messageId: string) => call("delete_message", { p_id: id(messageId) });

// ── saved & notifications ──
export async function saveItem(kind: "message" | "media" | "moment", targetId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { ok: false, error: "Please log in" } as Result;
  const col = { message: "message_id", media: "media_id", moment: "moment_id" }[kind];
  const { error } = await supabase.from("saved_items").insert({ user_id: data.user.id, kind, [col]: id(targetId) });
  if (error && error.code !== "23505") return fail(error);
  revalidatePath("/saved");
  return { ok: true } as Result;
}
export async function unsaveItem(savedId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("saved_items").delete().eq("id", id(savedId));
  if (error) return fail(error);
  revalidatePath("/saved");
  return { ok: true } as Result;
}
export async function markNotificationsRead(ids?: string[]) {
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", { p_ids: ids ?? null });
  revalidatePath("/notifications");
}
export async function deleteMedia(mediaId: string) {
  const supabase = await createClient();
  const { data: row } = await supabase.from("media_assets").select("path").eq("id", id(mediaId)).single();
  if (!row) return { ok: false, error: "Not found" } as Result;
  await supabase.storage.from("media").remove([row.path]);
  const { error } = await supabase.from("media_assets").delete().eq("id", mediaId);
  if (error) return fail(error);
  revalidatePath("/gallery");
  return { ok: true } as Result;
}

// ── profile & settings ──
export async function updateProfile(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = profileSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { fieldErrors: zodFieldErrors(parsed.error) };
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { error: "Please log in" };
  const d = parsed.data;
  const { error } = await supabase.from("profiles").update({
    display_name: d.displayName, username: d.username, bio: d.bio, status_text: d.statusText, accent: d.accent, visibility: d.visibility,
  }).eq("id", u.user.id);
  if (error) return error.code === "23505" ? { fieldErrors: { username: "That username is taken" } } : { error: "Could not save your profile." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile saved" };
}

export async function updateSettings(_: ActionState, form: FormData): Promise<ActionState> {
  const bool = (k: string) => form.get(k) === "on";
  const parsed = settingsSchema.safeParse({
    who_can_message: form.get("who_can_message"),
    notify_messages: bool("notify_messages"), notify_connections: bool("notify_connections"), notify_rooms: bool("notify_rooms"),
    notify_games: bool("notify_games"), notify_moments: bool("notify_moments"), notify_milestones: bool("notify_milestones"),
    streaks_enabled: bool("streaks_enabled"), show_streaks: bool("show_streaks"), reduce_motion: bool("reduce_motion"), show_online: bool("show_online"),
  });
  if (!parsed.success) return { error: "Invalid settings" };
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { error: "Please log in" };
  const { error } = await supabase.from("user_settings").update(parsed.data).eq("user_id", u.user.id);
  if (error) return { error: "Could not save settings." };
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved" };
}

// ── universe & games ──
export async function carePet() {
  const r = await call("care_for_pet", {}, ["/universe", "/home"]);
  return r;
}
export async function updateUniverse(theme: string, planet: string) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false } as Result;
  const p = z.object({ theme: z.enum(["dusk", "dawn", "aurora", "midnight"]), planet: z.enum(["berry", "lagoon", "ember", "meadow"]) }).parse({ theme, planet });
  await supabase.from("universe_spaces").update(p).eq("user_id", u.user.id);
  revalidatePath("/universe");
  return { ok: true } as Result;
}
export async function renamePet(name: string) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false } as Result;
  const n = z.string().trim().min(1).max(24).safeParse(name);
  if (!n.success) return { ok: false, error: "Pick a name up to 24 characters" } as Result;
  await supabase.from("pets").update({ name: n.data }).eq("owner_id", u.user.id);
  revalidatePath("/universe");
  return { ok: true } as Result;
}
export async function setAccessory(accessory: string | null) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: "Please log in" } as Result;
  const a = z.enum(["cloud_scarf", "star_charm"]).nullable().safeParse(accessory);
  if (!a.success) return { ok: false, error: "Unknown accessory" } as Result;
  const { error } = await supabase.from("pets").update({ accessory: a.data }).eq("owner_id", u.user.id);
  if (error) return { ok: false, error: /Reach level/.test(error.message) ? error.message : "Couldn't update the accessory." } as Result;
  revalidatePath("/universe");
  return { ok: true } as Result;
}
export async function finishWelcome(displayName: string, petName: string) {
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { ok: false, error: "Please log in" } as Result;
  const dn = z.string().trim().min(1, "Tell us what to call you").max(48).safeParse(displayName);
  const pn = z.string().trim().min(1, "Give Pip a name").max(24).safeParse(petName);
  if (!dn.success) return { ok: false, error: dn.error.issues[0]!.message } as Result;
  if (!pn.success) return { ok: false, error: pn.error.issues[0]!.message } as Result;
  await supabase.rpc("ensure_universe");
  const [a, b] = await Promise.all([
    supabase.from("profiles").update({ display_name: dn.data }).eq("id", u.user.id),
    supabase.from("pets").update({ name: pn.data }).eq("owner_id", u.user.id),
  ]);
  if (a.error || b.error) return { ok: false, error: "Couldn't save. Please try again." } as Result;
  await supabase.rpc("complete_onboarding");
  revalidatePath("/", "layout");
  return { ok: true } as Result;
}
export async function skipWelcome() {
  const supabase = await createClient();
  await supabase.rpc("complete_onboarding");
  redirect("/home");
}
export async function createInviteLink(conv: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invite_link", { p_conv: id(conv), p_days: 7, p_max_uses: 25 });
  if (error) return { ok: false, error: friendly(error.message) } as Result & { token?: string };
  revalidatePath(`/chats/${conv}/settings`);
  return { ok: true, token: data as string };
}
export const revokeInviteLink = async (conv: string, token: string) =>
  call("revoke_invite_link", { p_token: z.string().regex(/^[0-9a-f]{32}$/).parse(token) }, [`/chats/${conv}/settings`]);
export async function joinByLink(token: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_by_link", { p_token: z.string().regex(/^[0-9a-f]{32}$/).parse(token) });
  if (error) return { ok: false, error: /no longer valid/.test(error.message) ? "This invite link is no longer valid." : "Couldn't join with this link." } as Result;
  redirect(`/chats/${data}`);
}
export async function reportUser(target: string, reason: string) {
  const supabase = await createClient();
  const r = z.enum(["spam", "harassment", "inappropriate", "impersonation", "other"]).safeParse(reason);
  if (!r.success) return { ok: false, error: "Choose a reason" } as Result;
  const { error } = await supabase.rpc("submit_report", { p_target_user: id(target), p_message: null, p_reason: r.data, p_details: "" });
  if (error) return { ok: false, error: /too many/.test(error.message) ? "You've sent a lot of reports. Try again later." : "Couldn't send the report." } as Result;
  return { ok: true } as Result;
}
export async function startGame(friendId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_game", { p_kind: "tictactoe", p_invitee: id(friendId) });
  if (error) return fail(error);
  redirect(`/games/${data}`);
}
export const joinGame = async (gameId: string) => call("join_game", { p_session: id(gameId) }, [`/games/${gameId}`]);
export const cancelGame = async (gameId: string) => call("cancel_game", { p_session: id(gameId) }, ["/games"]);
