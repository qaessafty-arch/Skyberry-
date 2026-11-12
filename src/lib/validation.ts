import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,24}$/, "3–24 characters: letters, numbers and underscores");

export const passwordSchema = z.string().min(10, "Use at least 10 characters").max(72, "Use at most 72 characters");

export const registerSchema = z.object({
  displayName: z.string().trim().min(1, "Tell us what to call you").max(48),
  username: usernameSchema,
  email: z.string().trim().email("Enter a valid email"),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(48),
  username: usernameSchema,
  bio: z.string().trim().max(280),
  statusText: z.string().trim().max(80),
  accent: z.enum(["berry", "sky", "mint", "sun", "violet"]),
  visibility: z.enum(["public", "friends", "private"]),
});

export const spaceSchema = z.object({
  kind: z.enum(["group", "room"]),
  title: z.string().trim().min(1, "Give it a name").max(60),
  description: z.string().trim().max(500),
  visibility: z.enum(["private", "public"]),
});

export const messageSchema = z.string().trim().min(1).max(4000);
export const uuidSchema = z.string().uuid();

export const settingsSchema = z.object({
  who_can_message: z.enum(["everyone", "friends"]),
  notify_messages: z.boolean(),
  notify_connections: z.boolean(),
  notify_rooms: z.boolean(),
  notify_games: z.boolean(),
  notify_moments: z.boolean(),
  notify_milestones: z.boolean(),
  streaks_enabled: z.boolean(),
  show_streaks: z.boolean(),
  reduce_motion: z.boolean(),
  show_online: z.boolean(),
});

/** Escapes LIKE wildcards so user input is matched literally. */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);

export type ActionState = { ok?: boolean; error?: string; message?: string; fieldErrors?: Record<string, string> };

export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) out[String(issue.path[0] ?? "form")] ??= issue.message;
  return out;
}
