# Skyberry

A private, expressive social platform: profiles and connections, direct and group chats, public/private rooms with real roles, camera **Moments** that expire, a media gallery, saved items, notifications, a 3D **Universe** with pets and streaks, and server-authoritative multiplayer games.

**Stack:** Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS 4 · Supabase (Auth, Postgres + RLS, Realtime, Storage) · React Three Fiber · Zod · Vitest · Playwright.

> Status: the application builds and the database layer is tested locally, but **it has not been run against a live Supabase project** (none named `skyberry` existed and creating one needs your approval). See [PROJECT_STATUS.md](PROJECT_STATUS.md) for exactly what is verified and what is not.

## Quick start

```bash
npm install
cp .env.example .env.local        # fill in your Supabase URL + anon key
npm run dev                       # http://localhost:3000
```

Without Supabase configuration every page shows a setup screen; there is deliberately **no mock backend**.

To create the backend follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) (apply `supabase/migrations/*.sql`, enable Realtime, set auth URLs).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server / production build / serve build |
| `npm run typecheck` · `npm run lint` | TypeScript (strict) · ESLint |
| `npm test` | Unit tests (Vitest) |
| `npm run test:db` | Applies all migrations to a throwaway local Postgres and runs the SQL RLS/behaviour tests |
| `npm run test:e2e` | Playwright (public surface, mobile + desktop). Set `PW_CHROMIUM` if your Chromium is not Playwright's |

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Supabase setup](docs/SUPABASE_SETUP.md) · [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md) · [Security notes](docs/SECURITY.md) · [Assets & licensing](docs/ASSETS.md)
- [Project status & feature checklist](PROJECT_STATUS.md)
