# Testing

| Layer | Command | Covers |
| --- | --- | --- |
| Unit | `npm test` | magic-byte sniffing, redirect safety, validation, rate limiting, pet/level rules, game logic, formatting |
| Database | `npm run test:db` | Starts a throwaway Postgres (needs PostgreSQL server binaries), stubs `auth`/`storage`/`realtime`, applies every migration, then runs `supabase/tests/01_security_test.sql` impersonating five users. Asserts RLS, privilege escalation, Moment audience + expiry, media visibility, saved items, notifications, streak edge cases, game rules and message rate limiting |
| E2E | `npm run build && npm run test:e2e` | Public surface at mobile and desktop sizes: landing, form validation, a11y basics, anonymous redirects, auth on uploads/cron, security headers |

Not covered yet (needs a live Supabase project; see PROJECT_STATUS.md): browser-level register → chat → Moment → game flows, Realtime delivery, Storage policy behaviour against the real Storage service, and camera capture (needs a device).

For full-flow E2E create a dedicated Supabase project with email confirmation off, set the env vars, and add specs that sign up two users in separate browser contexts.
