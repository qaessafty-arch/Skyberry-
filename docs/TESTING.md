# Testing

| Layer | Command | Covers |
| --- | --- | --- |
| Unit | `npm test` | magic-byte sniffing, redirect safety, validation, rate limiting, pet/level rules, game logic, formatting |
| Database | `npm run test:db` | Starts a throwaway Postgres (needs PostgreSQL server binaries), stubs `auth`/`storage`/`realtime`, applies every migration, then runs `supabase/tests/01_security_test.sql` impersonating five users. Asserts RLS, privilege escalation, Moment audience + expiry, media visibility, saved items, notifications, streak edge cases, game rules and message rate limiting |
| Live E2E (phone) | `node scripts/live-mobile-flow.mjs` | Two confirmed test users against a live project at 390×844: login, connect, realtime chat both ways, photo upload (private storage + signed URL), streak, room create/join/roles, live tic-tac-toe, camera fallback, Moment share/view, Universe, pet care, Saved, notifications, gallery, profile edit, settings, signed-out block. Fails on horizontal overflow; reports console errors |
| CI | `.github/workflows/ci.yml` | Runs typecheck, lint, unit, DB security tests, build and public E2E + axe on every PR and push to main |
| E2E | `npm run build && npm run test:e2e` | Public surface at mobile and desktop sizes: landing, form validation, a11y basics, anonymous redirects, auth on uploads/cron, security headers, CSP, manifest/service worker, and axe (WCAG 2.1 AA: no serious/critical violations) |

Still not covered: camera capture and 3D performance on real phones, and a screen-reader audit.

**Sandboxed/proxied environments:** Node's built-in `fetch` ignores `HTTPS_PROXY`. If the app server must go through a proxy, start it with `NODE_USE_ENV_PROXY=1` (Node ≥ 22.21) or every server-side Supabase call fails.

For full-flow E2E create a dedicated Supabase project with email confirmation off, set the env vars, and add specs that sign up two users in separate browser contexts.
