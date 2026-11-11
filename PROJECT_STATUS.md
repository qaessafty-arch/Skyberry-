# PROJECT_STATUS

_Last updated: 2026-11-04 · Phases 0–9 attempted in one pass; honest status below._

## Headline

Skyberry runs end-to-end against a **live Supabase project** (`Skyberry`, ref `acspwxeksjzvgrttkuav`, region ap-south-1, created on a second Supabase account because the first hit the free-plan limit). All 8 migrations are applied; the security advisor reports only intended items. A two-user, phone-sized (390×844) browser run passes **25/25** steps with **0 console errors**, twice in a row on fresh accounts.

## UI/UX & identity transformation (2026-11-12)

- New sky-blue design system (tokens, Manrope, restrained glass, AA-checked colour pairs): `docs/DESIGN_SYSTEM.md`.
- Every screen moved onto it: landing, auth, Home, Chats + conversation (glass header/composer, tap-to-reveal message actions), rooms, games, camera/Moments, gallery, saved, search, notifications (categorised, grouped by recency), settings (grouped rows with icons), profile + public profile. Pink/magenta identity fully removed; no emoji in the interface.
- Navigation: glass bottom bar with filled active states and a modest camera tile; desktop sidebar with grouped destinations and a live notification count.
- Universe rebuilt: generated planets (seamless noise surfaces, clouds, atmosphere), sky themes, soft shadows, rim lighting, friends' real planet styles, Customize/Details sheets, WebGL and reduced-motion fallbacks.
- Pip rebuilt as a full-body procedural cloud fox with shell fur, detailed eyes and a behaviour system (idle/attention/happy/sleepy/react); level growth and level-locked accessories (migration 0009, enforced in the database). Existing XP/levels untouched. **Honest limit:** this is a high-quality real-time procedural character, not an artist-sculpted semi-realistic model; `docs/PET_PIPELINE.md` explains how an authored GLB replaces it with no code changes.
- Verified: typecheck, lint, unit, DB (incl. accessory rules), public E2E, live two-user phone run 26/26 with 0 console errors, desktop pages with no horizontal overflow, and screenshot review of every major screen plus Pip in each mood.

## Remaining blockers / to do by you

- **Revoke the Supabase access token** used for setup (Account → Access Tokens): it was pasted into the chat transcript and is still active.
- 10 leftover test image files in Storage → `media` (from deleted test accounts) can be removed from the dashboard.
- Optional cleanup in the first account: the empty, paused project `skyberry` (`hqopvsszghnlvqcxcgzj`); `ocean` was paused on 2026-11-04 to free a slot and can be resumed.
- Not yet verified: real phones (camera capture, 3D performance, iOS Safari), screen-reader audit, deployment to a public URL.

## Verified (commands actually run)

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` (strict + `noUncheckedIndexedAccess`) | pass |
| `npx eslint .` | 0 errors, 2 warnings (anonymous default export in config files) |
| `npx vitest run` | 17/17 pass |
| `npm run test:db` (8 migrations on local PG16 + 144 assertions as 5 impersonated users, with Supabase's default grants reproduced) | **all pass** |
| Live project: 8 migrations applied; security + performance advisors | only intended findings (signed-in RPCs, `username_available`, platform `rls_auto_enable`, unused indexes on an empty DB) |
| `scripts/live-mobile-flow.mjs` (2 users, 390×844, live backend) | **25/25**, 0 console errors |
| `next build` | success, 25 routes |
| `npx playwright test` (mobile 390×844 + desktop 1280×800) | 30/30 pass |
| `npm audit` | 1 moderate advisory in dev-only ESLint chain (`minimatch`); no runtime dependency affected |

Visual check: landing/register (mobile + desktop) and every signed-in screen at phone size reviewed from screenshots.

## Feature checklist

Legend: ✅ implemented + tested · ✅ live = also exercised in the browser against the live project · 🟡 needs a real device / further verification · ⛔ not built

| Area | Status | Notes |
| --- | --- | --- |
| Auth (register/login/logout/recovery/session/protected routes) | ✅ live | Supabase Auth; zod validation; rate-limited; redirect safety unit-tested; anon redirects E2E-tested |
| Profiles (display name, unique username, avatar, banner, bio, status, accent, privacy) | ✅ (rules) 🟡 (UI) | Visibility enforced by RLS; private profiles hidden from search |
| Connections (request/accept/decline/remove/block) | ✅ | |
| Direct + group chats, history, unread, search, edit/delete, media messages | ✅ live | Realtime thread, optimistic send + retry, typing, read markers, load-earlier |
| Rooms (create, public/private, discover, join/leave, members, settings) | ✅ live | Rooms and groups share one conversation model |
| Roles & group admin (owner/admin/moderator/member; invite/remove/role/transfer/edit/delete/moderate) | ✅ | Escalation paths tested |
| Camera + Moments (permissions, flip, photo, video ≤30 s, preview/retake, overlay text, audience, TTL, viewer, expiry, purge) | ✅ (DB rules) 🟡 (camera UI) | Camera needs a real device to verify; upload fallback exists |
| Media upload/gallery/viewer/delete | ✅ live | Progress, retry, magic-byte validation, signed URLs; see upload-size note in DEPLOYMENT.md |
| Saved (messages, media, Moments; filter; remove) | ✅ live | Re-checked through RLS when displayed |
| Notifications (list, unread, realtime count, preferences, deep links, coalescing) | ✅ live | No push/email delivery |
| Search (people, rooms, own messages) | ✅ (DB) 🟡 (UI) | Privacy-respecting |
| Universe: 3D scene, pet (XP/levels/care), streaks, milestones, customisation | ✅ (rules) 🟡 (3D UI) | Procedural 3D, reduced-motion + no-WebGL fallbacks; GPU/mobile perf not measured on device |
| Games: Tic-Tac-Toe, real server-authoritative multiplayer | ✅ live | One game by design; reconnect = refetch on subscribe/visibility |
| Settings (privacy, notifications, streak controls, reduce motion, blocked list, delete account) | 🟡 | Account deletion uses the service-role key server-side |
| Accessibility basics (labels, focus rings, dialogs, reduced motion, 44 px targets) | 🟡 | Not audited with a screen reader or axe |
| Docs (README, setup, testing, deployment, security, assets, architecture) | ✅ | |
| Invites by link/email, reports/moderation queue, push notifications, voice/video calls, more games, CSP header, i18n | ⛔ | Not in this pass |

## Found and fixed during live verification (2026-11-11)

- Hosted Supabase made every RPC callable by signed-out visitors (its default grants override ours) → migration 0007 revokes explicitly; local tests now reproduce Supabase's grants.
- Merging the media read policies broke uploads (INSERT … RETURNING could not see its own row) → owner check kept inline; regression test added and shown to fail on the old policy.
- Deleting accounts left ownerless/empty groups and rooms → migration 0008 hands ownership on and removes empty conversations.
- Chat missed messages sent while the realtime connection was still being established → catch-up fetch on (re)subscribe.
- Universe 3D panel overflowed phone width; Notifications page crashed (inline function passed to a client component); header logo missing on mobile (duplicate SVG gradient id); login reported network failures as "wrong password".
- `realtime.messages` is owned by Supabase on hosted projects → migration 0002 tolerates that.

## Not verified (needs a device)

Camera capture on phones, 3D performance on low-end mobile, iOS Safari quirks, axe/screen-reader audit.

## Decisions

Rooms and groups unified as conversations; writes via RPCs; UTC-day streaks (documented); hand-written DB types until a project exists; Next 16 `proxy.ts`; procedural 3D (no licensed assets); tic-tac-toe first; media uploaded through a server route for server-side validation.

## Known issues / risks

- `npm audit` dev-only moderate advisory (eslint → minimatch).
- Per-instance in-memory rate limiter on uploads/auth actions.
- No CSP header yet; no automated a11y tests.
- Realtime `postgres_changes` on `messages` for very large rooms may need a broadcast-based fan-out at scale.
