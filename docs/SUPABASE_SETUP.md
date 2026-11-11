# Supabase setup

No project is created by this repository. Do this once:

1. Create a project named **skyberry** at <https://supabase.com/dashboard> (choose a region near your users).
2. **Apply migrations** in order — either `supabase link --project-ref <ref> && supabase db push`, or paste each file of `supabase/migrations/` into the SQL editor in filename order (8 files).
3. **Realtime**: the migration adds `messages`, `conversation_members`, `notifications`, `game_sessions`, `moments` to the `supabase_realtime` publication. In *Project Settings → Realtime* keep "Allow public access" **off** (typing indicators use private channels authorised by RLS).
4. **Auth → URL configuration**: Site URL = your deployed URL; add `http://localhost:3000/auth/callback` and `<site>/auth/callback` to Redirect URLs. Decide whether to require email confirmation (default on; the UI handles both).
5. **Storage**: buckets `avatars` (public) and `media` (private) are created by migration 0004 with size/MIME limits and policies. Verify under *Storage → Policies*.
6. **Keys**: copy the project URL and the anon/publishable key into `.env.local`. Put the **service-role key** only in server environment variables (never `NEXT_PUBLIC_*`).
7. Set `CRON_SECRET` (≥16 random chars) and schedule `GET /api/cron/purge` hourly with `Authorization: Bearer <CRON_SECRET>` (e.g. Vercel Cron, GitHub Actions, or Supabase `pg_cron` + `pg_net`).
8. Run *Advisors* (security + performance) after applying and review any findings.

Generate typed clients later with `supabase gen types typescript --project-id <ref> > src/lib/database.types.ts` (the app currently uses hand-written row types in `src/lib/types.ts`).

## Migrations

| File | Contents |
| --- | --- |
| `…0001_foundation` | profiles, settings, connections, new-user trigger, connection RPCs, user search |
| `…0002_messaging` | conversations, members, invites, messages, roles RPCs, rate limit, typing authorisation |
| `…0003_notifications` | notifications + `private.notify` |
| `…0004_media_moments_saved` | Moments, audiences, media visibility, storage buckets/policies, saved items, purge function |
| `…0005_universe` | space, pets, streaks, milestones and their rules |
| `…0006_games` | game sessions + tic-tac-toe RPCs, realtime publication |
| `…0007_hardening` | revokes anon EXECUTE on RPCs (hosted default grants), merged media policy, FK indexes |
| `…0008_membership_lifecycle` | ownership hand-over and empty-conversation cleanup when members are deleted |

Migrations are forward-only; add new files rather than editing applied ones.

## Current project

The live project is `Skyberry` (ref `acspwxeksjzvgrttkuav`, ap-south-1). Auth Site URL is `http://localhost:3000` with `http://localhost:3000/**` allowed; change both to the deployed URL when you deploy. Email confirmation is on.
