/** Mirrors the SQL rules in migration 0005 (kept in sync by unit tests). */
export const petLevel = (xp: number) => Math.floor(Math.sqrt(Math.max(0, xp) / 25)) + 1;
export const xpForLevel = (level: number) => 25 * (level - 1) ** 2;
export function levelProgress(xp: number) {
  const level = petLevel(xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, floor, next, pct: Math.round(((xp - floor) / (next - floor)) * 100) };
}
/** Gentle, never-punishing mood derived from the last care time. */
export function petMood(lastCaredAt: string | null, now = Date.now()): "glowing" | "content" | "sleepy" {
  if (!lastCaredAt) return "sleepy";
  const hours = (now - new Date(lastCaredAt).getTime()) / 36e5;
  return hours < 8 ? "glowing" : hours < 24 ? "content" : "sleepy";
}
export const MILESTONES: Record<string, { label: string; hint: string }> = {
  first_message: { label: "First words", hint: "Send your first message" },
  first_friend: { label: "Not alone", hint: "Make your first connection" },
  streak_3: { label: "Warming up", hint: "Reach a 3-day streak" },
  streak_7: { label: "Orbit", hint: "Reach a 7-day streak" },
  streak_30: { label: "Constellation", hint: "Reach a 30-day streak" },
  pet_level_5: { label: "Bonded", hint: "Raise your pet to level 5" },
  first_win: { label: "Good game", hint: "Win a game" },
};
