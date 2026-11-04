# PROJECT_STATUS

_Last updated: 2026-11-04 · Phases 0–9 attempted in one pass; honest status below._

## Headline

The app **builds**, passes typecheck/lint/unit/DB/E2E suites that can run offline, and the entire backend (schema, RLS, RPCs, storage policies) is written and tested on a local Postgres. It has **not** been run against a live Supabase project: no project named `skyberry` existed in the connected account (it holds two inactive projects and an unrelated active one, `ocean`, which I did not touch), and creating one needs your approval (cost + organization).

## Blocker & exact next step

1. Create the Supabase project `skyberry` (or tell me which organization to create it in).
2. Apply `supabase/migrations/*.sql`, fill `.env.local` (see `docs/SUPABASE_SETUP.md`).
3. Then the live-only checks below can be run (Realtime, Storage API, full-browser flows).

## Verified (commands actually run)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` (strict + `noUncheckedIndexedAccess`) | pass |
| `npx eslint .` | 0 errors, 2 warnings (anonymous default export in config files) |
| `npx vitest run` | 17/17 pass |
| `npm run test:db` (6 migrations on local PG16 + ~130 assertions as 5 impersonated users) | **all pass** |
| `next build` | success, 25 routes |
| `npx playwright test` (mobile 390×844 + desktop 1280×800) | 30/30 pass |
| `npm audit` | 1 moderate advisory in dev-only ESLint chain (`minimatch`); no runtime dependency affected |

Visual check: landing + register screenshots reviewed at mobile and desktop widths.

## Feature checklist

Legend: ✅ implemented + DB-level tested · 🟡 implemented, needs live-backend verification · ⛔ not built

| Area | Status | Notes |
| --- | --- | --- |
| Auth (register/login/logout/recovery/session/protected routes) | 🟡 | Supabase Auth; zod validation; rate-limited; redirect safety unit-tested; anon redirects E2E-tested |
| Profiles (display name, unique username, avatar, banner, bio, status, accent, privacy) | ✅ (rules) 🟡 (UI) | Visibility enforced by RLS; private profiles hidden from search |
| Connections (request/accept/decline/remove/block) | ✅ | |
| Direct + group chats, history, unread, search, edit/delete, media messages | ✅ (DB) 🟡 (UI) | Realtime thread, optimistic send + retry, typing, read markers, load-earlier |
| Rooms (create, public/private, discover, join/leave, members, settings) | ✅ (DB) 🟡 (UI) | Rooms and groups share one conversation model |
| Roles & group admin (owner/admin/moderator/member; invite/remove/role/transfer/edit/delete/moderate) | ✅ | Escalation paths tested |
| Camera + Moments (permissions, flip, photo, video ≤30 s, preview/retake, overlay text, audience, TTL, viewer, expiry, purge) | ✅ (DB rules) 🟡 (camera UI) | Camera needs a real device to verify; upload fallback exists |
| Media upload/gallery/viewer/delete | ✅ (rules) 🟡 (UI) | Progress, retry, magic-byte validation, signed URLs; see upload-size note in DEPLOYMENT.md |
| Saved (messages, media, Moments; filter; remove) | ✅ (DB) 🟡 (UI) | Re-checked through RLS when displayed |
| Notifications (list, unread, realtime count, preferences, deep links, coalescing) | ✅ (DB) 🟡 (UI) | No push/email delivery |
| Search (people, rooms, own messages) | ✅ (DB) 🟡 (UI) | Privacy-respecting |
| Universe: 3D scene, pet (XP/levels/care), streaks, milestones, customisation | ✅ (rules) 🟡 (3D UI) | Procedural 3D, reduced-motion + no-WebGL fallbacks; GPU/mobile perf not measured on device |
| Games: Tic-Tac-Toe, real server-authoritative multiplayer | ✅ (rules) 🟡 (UI) | One game by design; reconnect = refetch on subscribe/visibility |
| Settings (privacy, notifications, streak controls, reduce motion, blocked list, delete account) | 🟡 | Account deletion uses the service-role key server-side |
| Accessibility basics (labels, focus rings, dialogs, reduced motion, 44 px targets) | 🟡 | Not audited with a screen reader or axe |
| Docs (README, setup, testing, deployment, security, assets, architecture) | ✅ | |
| Invites by link/email, reports/moderation queue, push notifications, voice/video calls, more games, CSP header, i18n | ⛔ | Not in this pass |

## Not verified (needs live Supabase or a device)

Realtime delivery and private-channel auth, Storage API against the policies, full register→chat→Moment→game browser flows with two users, camera capture on phones, 3D performance on low-end mobile, axe/screen-reader audit.

## Decisions

Rooms and groups unified as conversations; writes via RPCs; UTC-day streaks (documented); hand-written DB types until a project exists; Next 16 `proxy.ts`; procedural 3D (no licensed assets); tic-tac-toe first; media uploaded through a server route for server-side validation.

## Known issues / risks

- `npm audit` dev-only moderate advisory (eslint → minimatch).
- Per-instance in-memory rate limiter on uploads/auth actions.
- No CSP header yet; no automated a11y tests.
- Realtime `postgres_changes` on `messages` for very large rooms may need a broadcast-based fan-out at scale.
