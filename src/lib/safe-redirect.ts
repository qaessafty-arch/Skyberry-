/** Only allow same-origin relative paths (prevents open redirects via ?next=). */
export function safeNext(next: string | null | undefined, fallback = "/home"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  try {
    const u = new URL(next, "http://x");
    if (u.origin !== "http://x") return fallback;
  } catch {
    return fallback;
  }
  return next;
}
