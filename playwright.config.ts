import { defineConfig } from "@playwright/test";

// Public-surface E2E (no live Supabase needed). Full-flow E2E needs a real project: see docs/TESTING.md.
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: { baseURL: "http://localhost:3100", launchOptions: { executablePath: process.env.PW_CHROMIUM || undefined, args: process.env.CI || process.env.PW_CHROMIUM ? ["--no-sandbox"] : [] } },
  projects: [
    { name: "mobile", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "npx next start -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key" },
  },
});
