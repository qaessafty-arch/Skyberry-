import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing page presents the product and links to sign-up", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Stay close");
  await page.getByRole("link", { name: "Create your account" }).click();
  await expect(page).toHaveURL(/\/register/);
  await expect(page.getByRole("heading", { name: "Join Skyberry" })).toBeVisible();
});

test("no horizontal scroll at this viewport", async ({ page }) => {
  for (const path of ["/", "/login", "/register"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(0);
  }
});

test("registration validates input client-visible errors from the server action", async ({ page }) => {
  await page.goto("/register");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Tell us what to call you")).toBeVisible();
  await expect(page.getByText("Enter a valid email")).toBeVisible();
});

test("login form is labelled and keyboard reachable", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByLabel("Password").fill("x");
  await expect(page.getByRole("button", { name: "Log in" })).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Log in" })).toBeFocused();
});

for (const path of ["/home", "/chats", "/chats/00000000-0000-0000-0000-000000000000", "/camera", "/universe", "/settings", "/saved", "/games"]) {
  test(`protected route ${path} redirects anonymous users to login`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login\?next=/);
  });
}

test("uploads require authentication", async ({ request }) => {
  const res = await request.post("/api/media", { multipart: { file: { name: "a.png", mimeType: "image/png", buffer: Buffer.from("x") }, purpose: "gallery" } });
  expect(res.status()).toBe(401);
});

test("cron purge rejects missing or wrong secret", async ({ request }) => {
  expect((await request.get("/api/cron/purge")).status()).toBe(401);
  expect((await request.get("/api/cron/purge", { headers: { authorization: "Bearer wrong" } })).status()).toBe(401);
});

test("security headers are present", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
});

for (const path of ["/", "/login", "/register", "/forgot-password", "/offline"]) {
  test(`no serious accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
  });
}

test("app is installable: manifest and service worker are served", async ({ request }) => {
  const m = await request.get("/manifest.webmanifest");
  expect(m.status()).toBe(200);
  expect((await m.json()).display).toBe("standalone");
  expect((await request.get("/sw.js")).status()).toBe(200);
});

test("content security policy is set", async ({ request }) => {
  const csp = (await request.get("/login")).headers()["content-security-policy"] ?? "";
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
});
