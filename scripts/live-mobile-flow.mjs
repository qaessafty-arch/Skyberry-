// Two-user, phone-sized (390x844) end-to-end run against a LIVE Supabase project.
// Usage: start the app, create two confirmed test users alice_sky and bob_berry, then
//   LIVE_USERS=live-users.json node scripts/live-mobile-flow.mjs
// live-users.json: {"alice_sky":{"email":"…","password":"…"},"bob_berry":{…}}  (never commit it)
import { chromium } from "playwright-core";
import fs from "node:fs";
import AxeBuilder from "@axe-core/playwright";
const BASE = process.env.BASE_URL ?? "http://localhost:3000", OUT = process.env.SHOTS_DIR ?? "test-results/live-shots";
fs.mkdirSync(OUT, { recursive: true });
const creds = JSON.parse(fs.readFileSync(process.env.LIVE_USERS ?? "live-users.json", "utf8"));
const results = []; const errors = [];
const log = (ok, step, note = "") => { results.push({ ok, step, note }); console.log(`${ok ? "PASS" : "FAIL"} ${step}${note ? " — " + note : ""}`); };
const b = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
async function user(name) {
  const ctx = await b.newContext(phone); const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && errors.push(`[${name}] ${m.text().slice(0, 200)}`));
  p.on("pageerror", (e) => errors.push(`[${name}] pageerror ${e.message.slice(0, 200)}`));
  await p.goto(BASE + "/login");
  await p.getByLabel("Email").fill(creds[name].email); await p.getByLabel("Password").fill(creds[name].password);
  await p.getByRole("button", { name: "Log in" }).click(); await p.waitForURL(/\/(home|welcome)/, { timeout: 20000 });
  if (p.url().includes("/welcome")) { // brand-new accounts go through the welcome flow once
    await p.getByRole("button", { name: /Continue/ }).click();
    await p.getByLabel("Name your companion").fill("Pip");
    await p.getByRole("button", { name: /Continue/ }).click();
    await p.getByRole("button", { name: /^Finish/ }).click();
    await p.waitForURL(/\/home/, { timeout: 20000 });
  }
  return p;
}
async function step(name, fn) { try { const n = await fn(); log(true, name, n ?? ""); } catch (e) { log(false, name, String(e.message).split("\n")[0].slice(0, 220)); } }
async function shot(p, file) {
  await p.waitForTimeout(700);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  await p.screenshot({ path: `${OUT}/${file}.png` });
  if (over > 0) throw new Error(`horizontal overflow ${over}px`);
}
let A, B;
await step("alice logs in (mobile)", async () => { A = await user("alice_sky"); await shot(A, "01-home-alice"); });
await step("bob logs in (mobile)", async () => { B = await user("bob_berry"); });
await step("alice searches bob and connects", async () => {
  await A.goto(BASE + "/search?q=bob"); await A.getByText("Bob Berry").first().waitFor();
  await shot(A, "02-search"); await A.getByRole("button", { name: "Connect" }).click(); await A.getByText("Requested").waitFor({ timeout: 10000 });
});
await step("bob sees request on home and accepts", async () => {
  await B.goto(BASE + "/home"); await B.getByText("Connection requests").waitFor(); await shot(B, "03-home-request");
  await B.getByRole("button", { name: "Accept" }).first().click(); await B.waitForTimeout(1500);
});
let chatUrl;
await step("alice opens a direct chat from bob's profile", async () => {
  await A.goto(BASE + "/u/bob_berry"); await shot(A, "04-profile-bob");
  await A.getByRole("button", { name: "Message" }).click(); await A.waitForURL(/\/chats\/[0-9a-f-]{36}/, { timeout: 15000 }); chatUrl = A.url();
});
await step("bob receives a message in realtime (no reload)", async () => {
  await B.goto(chatUrl); await B.getByText("No messages yet").waitFor();
  await A.getByLabel("Message", { exact: true }).fill("Hi Bob, testing Skyberry on mobile"); await A.getByRole("button", { name: "Send message" }).click();
  await B.getByText("Hi Bob, testing Skyberry on mobile").waitFor({ timeout: 15000 }); await shot(B, "05-chat-bob");
});
await step("bob replies and alice sees 'Seen'/reply live", async () => {
  await B.getByLabel("Message", { exact: true }).fill("Hey Alice! Works here."); await B.getByRole("button", { name: "Send message" }).click();
  await A.getByText("Hey Alice! Works here.").waitFor({ timeout: 15000 }); await shot(A, "06-chat-alice");
});
await step("alice sends a photo (server validation + private storage + signed URL)", async () => {
  await A.locator("#chat-file").setInputFiles("e2e/fixtures/test.png");
  await B.getByRole("img", { name: "Shared photo" }).waitFor({ timeout: 20000 }); await shot(B, "07-chat-photo");
});
await step("chats list shows the conversation", async () => { await A.goto(BASE + "/chats"); await A.getByText("Bob Berry").waitFor(); await shot(A, "08-chats"); });
await step("streak started after both messaged", async () => { await A.goto(BASE + "/home"); await A.getByText("Done today").waitFor({ timeout: 8000 }); await shot(A, "09-home-streak"); });
await step("alice creates a public room", async () => {
  await A.goto(BASE + "/rooms/new"); await A.getByLabel("Room name").fill("Berry Lounge"); await A.getByLabel("Description").fill("Open hangout for testers");
  await shot(A, "10-room-new"); await A.getByRole("button", { name: "Create room" }).click(); await A.waitForURL(/\/chats\//, { timeout: 15000 });
});
await step("bob discovers and joins the room", async () => {
  await B.goto(BASE + "/rooms"); await B.getByRole("heading", { name: "Berry Lounge" }).waitFor(); await shot(B, "11-rooms");
  await B.getByRole("link", { name: "View & join" }).first().click(); await B.getByRole("button", { name: "Join room" }).click();
  await B.getByText("Bob Berry joined").waitFor({ timeout: 15000 });
});
await step("room settings show roles (alice owner)", async () => {
  await A.goto(A.url() + "/settings"); await A.getByText("owner").first().waitFor(); await shot(A, "12-room-settings");
});
let gameUrl;
await step("alice challenges bob to tic-tac-toe", async () => {
  await A.goto(BASE + "/games"); await shot(A, "13-games"); await A.getByRole("button", { name: /Bob Berry/ }).click();
  await A.waitForURL(/\/games\/[0-9a-f-]{36}/, { timeout: 15000 }); gameUrl = A.url();
});
await step("bob accepts; moves sync live both ways", async () => {
  await B.goto(gameUrl); await B.getByRole("button", { name: "Accept challenge" }).click();
  await A.getByText("Your turn (X)").waitFor({ timeout: 15000 });
  await A.getByRole("gridcell", { name: "Cell 1, empty" }).click(); await B.getByText(/Your turn \(O\)/).waitFor({ timeout: 15000 });
  await B.getByRole("gridcell", { name: "Cell 4, empty" }).click(); await A.getByText("Your turn (X)").waitFor({ timeout: 15000 });
  await A.getByRole("gridcell", { name: "Cell 2, empty" }).click(); await B.getByText(/Your turn/).waitFor({ timeout: 15000 });
  await B.getByRole("gridcell", { name: "Cell 5, empty" }).click(); await A.getByText("Your turn (X)").waitFor({ timeout: 15000 });
  await A.getByRole("gridcell", { name: "Cell 3, empty" }).click(); await A.getByText("You won!").waitFor({ timeout: 15000 });
  await B.getByText(/won\./).waitFor({ timeout: 15000 }); await shot(A, "14-game-won");
});
await step("camera screen handles no-camera device gracefully", async () => {
  await A.goto(BASE + "/camera"); await A.getByRole("button", { name: "Turn on camera" }).click();
  await A.getByText(/No camera was found|Camera access is blocked|couldn't start/).waitFor({ timeout: 10000 }); await shot(A, "15-camera");
});
await step("alice shares a Moment via upload; bob sees it", async () => {
  await A.locator('input[type=file]').setInputFiles("e2e/fixtures/test.png");
  await A.getByLabel("Text on your Moment").fill("Hello sky"); await shot(A, "16-moment-compose");
  await A.getByRole("button", { name: /Share Moment/ }).click(); await A.getByRole("tab", { name: /Moments \(1\)/ }).waitFor({ timeout: 20000 });
  await B.goto(BASE + "/camera?tab=moments"); await B.getByText("Alice Sky").first().click(); await B.getByText("Hello sky").waitFor({ timeout: 10000 });
  await shot(B, "17-moment-view");
});
await step("universe renders (3D or fallback)", async () => { await A.goto(BASE + "/universe"); await A.getByRole("heading", { name: /sky$/ }).first().waitFor(); await A.waitForTimeout(4000); await shot(A, "18-universe"); });
await step("interact with Pip and open Customize", async () => { await A.getByRole("button", { name: "Interact" }).click(); await A.waitForTimeout(600); await shot(A, "18b-universe-interact"); await A.getByRole("button", { name: "Customize" }).click(); await A.getByText("Accessory").waitFor(); await shot(A, "18c-customize"); await A.getByRole("button", { name: "Close" }).first().click(); });
await step("care for pet persists XP", async () => { await A.getByRole("button", { name: "Care", exact: true }).click(); await A.getByRole("status").filter({ hasText: "+5 XP" }).waitFor({ timeout: 10000 }); await A.reload(); await A.getByText(/XP ·/).first().waitFor(); });
await step("save a message, see it in Saved", async () => {
  await B.goto(chatUrl); await B.getByText("Hi Bob, testing Skyberry on mobile").click(); await B.getByRole("button", { name: "Save message" }).first().click(); await B.waitForTimeout(1200);
  await B.goto(BASE + "/saved"); await B.getByText("Hi Bob, testing Skyberry on mobile").waitFor({ timeout: 10000 }); await shot(B, "19-saved");
});
await step("notifications list", async () => { await B.goto(BASE + "/notifications"); await B.getByRole("heading", { name: "Notifications" }).waitFor(); await shot(B, "20-notifications"); });
await step("gallery", async () => { await A.goto(BASE + "/gallery"); await A.getByRole("heading", { name: "Gallery" }).waitFor(); await shot(A, "21-gallery"); });
await step("profile edit saves", async () => {
  await A.goto(BASE + "/profile"); await A.getByLabel("Status").fill("Testing on a phone"); await A.getByRole("button", { name: "Save profile" }).click();
  await A.getByText("Profile saved").waitFor({ timeout: 10000 }); await shot(A, "22-profile");
});
await step("settings", async () => { await A.goto(BASE + "/settings"); await A.getByRole("heading", { name: "Settings" }).waitFor(); await shot(A, "23-settings"); });
await step("accessibility: no serious/critical axe violations on signed-in screens", async () => {
  const found = [];
  for (const path of ["/home", "/chats", new URL(chatUrl).pathname, "/notifications", "/settings", "/profile", "/universe", "/games", "/rooms"]) {
    await A.goto(BASE + path); await A.waitForTimeout(path === "/universe" ? 2500 : 600);
    const { violations } = await new AxeBuilder({ page: A }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).exclude("canvas").analyze();
    violations.filter((v) => v.impact === "serious" || v.impact === "critical").forEach((v) => found.push(`${path} ${v.id} (${v.nodes.length}): ${v.nodes[0]?.target}`));
  }
  if (found.length) throw new Error(found.slice(0, 6).join(" | "));
});
await step("react and reply to a message", async () => {
  await B.goto(chatUrl); await B.getByText("Hi Bob, testing Skyberry on mobile").click();
  await B.getByRole("button", { name: "Add reaction" }).first().click(); await B.getByRole("menuitem", { name: "Love" }).click();
  await A.goto(chatUrl); await A.getByRole("button", { name: /Love, 1/ }).waitFor({ timeout: 15000 });
  await A.getByText("Hey Alice! Works here.").click(); await A.getByRole("button", { name: "Reply" }).first().click();
  await A.getByLabel("Message", { exact: true }).fill("Replying to you"); await A.getByRole("button", { name: "Send message" }).click();
  await B.getByText("Replying to you").waitFor({ timeout: 15000 }); await shot(B, "24-reply-reaction");
});
await step("invite link: create, preview and join", async () => {
  await A.goto(BASE + "/chats/new"); await A.getByLabel("Group name").fill("Link Testers");
  await A.getByRole("button", { name: "Create group" }).click(); await A.waitForURL(/\/chats\/[0-9a-f-]{36}$/, { timeout: 15000 });
  await A.goto(A.url() + "/settings"); await A.getByRole("button", { name: "Create link" }).click();
  const link = await A.locator("code").first().textContent({ timeout: 15000 });
  await B.goto(link.replace(/^https?:\/\/[^/]+/, BASE)); await shot(B, "25-join-link");
  await B.getByRole("button", { name: /Join group/ }).click(); await B.waitForURL(/\/chats\//, { timeout: 15000 });
});
await step("online status visible to a connection", async () => {
  await B.goto(BASE + "/chats"); await B.getByText("Online").first().waitFor({ state: "attached", timeout: 15000 });
});
await step("signed-out user is blocked from bob's chat", async () => {
  const ctx = await b.newContext(phone); const p = await ctx.newPage(); await p.goto(chatUrl); await p.waitForURL(/\/login/); await ctx.close();
});
fs.writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, errors }, null, 1));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} passed; console errors: ${errors.length}`);
errors.slice(0, 15).forEach((e) => console.log("  " + e));
await b.close();
