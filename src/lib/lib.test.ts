import { describe, expect, it } from "vitest";
import { sniffMedia } from "./media-sniff";
import { safeNext } from "./safe-redirect";
import { rateLimit } from "./rate-limit";
import { escapeLike, loginSchema, passwordSchema, profileSchema, registerSchema, usernameSchema } from "./validation";
import { levelProgress, petLevel, petMood, xpForLevel } from "./universe";
import { winningLine } from "./games";
import { timeAgo, timeLeft } from "./format";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(Math.max(0, 16 - b.length)).fill(0)]);
const ascii = (s: string, at = 0) => { const a = new Uint8Array(16); [...s].forEach((c, i) => (a[at + i] = c.charCodeAt(0))); return a; };

describe("sniffMedia (never trusts client MIME)", () => {
  it("detects jpeg/png/gif/webp", () => {
    expect(sniffMedia(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe("image/jpeg");
    expect(sniffMedia(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe("image/png");
    expect(sniffMedia(ascii("GIF89a"))?.mime).toBe("image/gif");
    const webp = ascii("RIFF"); [..."WEBP"].forEach((c, i) => (webp[8 + i] = c.charCodeAt(0)));
    expect(sniffMedia(webp)?.mime).toBe("image/webp");
  });
  it("detects mp4/mov/webm as video", () => {
    const mp4 = ascii("ftypisom", 4); expect(sniffMedia(mp4)).toMatchObject({ mime: "video/mp4", kind: "video" });
    const mov = ascii("ftypqt  ", 4); expect(sniffMedia(mov)?.mime).toBe("video/quicktime");
    expect(sniffMedia(bytes(0x1a, 0x45, 0xdf, 0xa3))?.mime).toBe("video/webm");
  });
  it("rejects html, svg, scripts and short files disguised as media", () => {
    expect(sniffMedia(ascii("<html><script>"))).toBeNull();
    expect(sniffMedia(ascii("<svg xmlns=\"http"))).toBeNull();
    expect(sniffMedia(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(sniffMedia(ascii("MZ\u0090\u0000"))).toBeNull();
  });
});

describe("safeNext (open-redirect protection)", () => {
  it("allows local paths", () => { expect(safeNext("/chats/abc?x=1")).toBe("/chats/abc?x=1"); });
  it("blocks external / protocol-relative / backslash tricks", () => {
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", "evil", "", null, undefined]) expect(safeNext(bad as string)).toBe("/home");
  });
});

describe("rateLimit", () => {
  it("limits within the window and recovers after", () => {
    const k = "t" + Math.random();
    expect([1, 2, 3].map((i) => rateLimit(k, 2, 1000, 1000 + i))).toEqual([true, true, false]);
    expect(rateLimit(k, 2, 1000, 5000)).toBe(true);
  });
});

describe("validation", () => {
  it("normalises usernames", () => { expect(usernameSchema.parse("  Sky_Berry ")).toBe("sky_berry"); });
  it("rejects bad usernames", () => { for (const u of ["ab", "has space", "emoji😀", "x".repeat(25), "a-b"]) expect(usernameSchema.safeParse(u).success).toBe(false); });
  it("password rules", () => { expect(passwordSchema.safeParse("short").success).toBe(false); expect(passwordSchema.safeParse("long-enough-pass").success).toBe(true); });
  it("register & login schemas", () => {
    expect(registerSchema.safeParse({ displayName: "A", username: "abc", email: "a@b.co", password: "0123456789" }).success).toBe(true);
    expect(registerSchema.safeParse({ displayName: "", username: "abc", email: "nope", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
  it("profile schema rejects unknown enum values (mass-assignment guard)", () => {
    const base = { displayName: "A", username: "abc", bio: "", statusText: "", accent: "berry", visibility: "public" };
    expect(profileSchema.safeParse(base).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, visibility: "admin" }).success).toBe(false);
  });
  it("escapeLike neutralises wildcards", () => { expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\"); });
});

describe("universe rules (mirror SQL)", () => {
  it("levels", () => {
    expect([0, 24, 25, 99, 100, 225, 400].map(petLevel)).toEqual([1, 1, 2, 2, 3, 4, 5]);
    expect(xpForLevel(5)).toBe(400);
  });
  it("progress", () => { expect(levelProgress(50)).toMatchObject({ level: 2, floor: 25, next: 100, pct: 33 }); });
  it("mood is gentle", () => {
    const now = Date.now();
    expect(petMood(new Date(now - 3600e3).toISOString(), now)).toBe("glowing");
    expect(petMood(new Date(now - 12 * 3600e3).toISOString(), now)).toBe("content");
    expect(petMood(null, now)).toBe("content");
    expect(petMood(new Date(now - 30 * 3600e3).toISOString(), now)).toBe("sleepy");
  });
});

describe("tic-tac-toe winningLine", () => {
  it("finds lines", () => {
    expect(winningLine(["X", "X", "X", "", "", "", "", "", ""])).toEqual([0, 1, 2]);
    expect(winningLine(["O", "", "", "", "O", "", "", "", "O"])).toEqual([0, 4, 8]);
    expect(winningLine(["X", "O", "X", "", "", "", "", "", ""])).toBeNull();
  });
});

describe("format", () => {
  it("timeAgo/timeLeft", () => {
    const now = Date.UTC(2026, 0, 1, 12);
    expect(timeAgo(new Date(now - 10_000).toISOString(), now)).toBe("now");
    expect(timeAgo(new Date(now - 5 * 60_000).toISOString(), now)).toBe("5m");
    expect(timeAgo(new Date(now - 3 * 3600_000).toISOString(), now)).toBe("3h");
    expect(timeLeft(new Date(now + 90 * 60_000).toISOString(), now)).toBe("1h left");
  });
});
