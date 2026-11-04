# Architecture

## Layout

```
src/app/(auth)         login, register, forgot-password          src/app/(app)   authenticated product shell + pages
src/app/api            media, avatar, account, cron/purge         src/proxy.ts    session refresh + route protection
src/features           server actions (zod-validated mutations)   src/components  UI, nav, realtime helpers, 3D scene
src/lib                supabase clients, validation, upload sniffing, rate limit, universe/game rules
supabase/migrations    schema, RLS, RPCs, storage policies        supabase/tests  SQL security tests (run on local Postgres)
```

Server Components fetch data as the signed-in user (RLS applies). Client components exist only where interaction needs them (chat thread, camera, game board, 3D scene, forms).

## Security model (the important part)

* **RLS on every table.** Grants are explicit: clients get `SELECT` plus narrowly-scoped column `UPDATE`s. Nothing relies on Supabase default grants.
* **Writes go through `SECURITY DEFINER` RPCs** that read identity from `auth.uid()` (never from a client-sent id) and enforce rules: connections, conversation creation/membership/roles, Moments, notifications, pets/streaks, games.
* **Roles** (`owner > admin > moderator > member`): membership/role changes exist only as RPCs with rank checks (a member cannot self-promote; admins cannot create admins; one owner is enforced by a unique index; ownership moves only via `transfer_ownership`).
* **Moments** visibility (friends / selected / private) and expiry are evaluated in SQL (`private.can_view_moment`); expired Moments are invisible to everyone, then physically purged by `/api/cron/purge`.
* **Media**: private bucket, owner-folder uploads only, reads allowed by `private.can_view_media_path` (owner, conversation member, or Moment audience). The browser only ever receives short-lived signed URLs. `/api/media` decides type from magic bytes and enforces size limits; the bucket and `media_assets` also constrain MIME and size.
* **Service role key** is used only in `server-only` modules for cron purge and account deletion.

## Data model (summary)

`profiles`, `user_settings`, `connections` (accepted/pending/blocked) · `conversations` (kind `direct|group|room`, one model for chats/groups/rooms), `conversation_members` (role, `last_read_at`), `conversation_invites`, `messages`, `media_assets` · `moments`, `moment_audience`, `moment_views` · `saved_items` · `notifications` · `universe_spaces`, `pets`, `streaks`, `milestones` · `game_sessions`, `game_participants`, `game_invites`.

## Rules worth knowing

**Streaks.** A day is a UTC calendar day. It *completes* when both friends each send a message in their direct chat that day. Completing the day after the previous completion adds 1; any longer gap restarts at 1. Display is evaluated lazily: `complete`, `at_risk` (yesterday done, today pending), or `broken` (shown as 0). Either person can switch streak tracking off (stops tracking for both). No penalties beyond the count resetting.

**Pet XP.** +1/message (max 20/day), +5 care (4 h cooldown), +10 per completed streak day, games +25/+10/+5. Level = ⌊√(xp/25)⌋+1. Clients cannot write XP/streak/milestone columns.

**Games.** `game_sessions.state` is authoritative; `make_move` locks the row, checks turn, cell, and optimistic `version`, detects win/draw and grants XP. Clients subscribe with Realtime and re-fetch on reconnect/visibility. This is real multiplayer (two accounts, shared server state) — not simulated. Forfeit can be claimed after 24 h idle.

**Notifications** are created only by `private.notify`, which honors per-user preferences, skips blocked users, and coalesces message notifications (one unread per conversation). Large public rooms do not notify per message.

**Realtime.** `postgres_changes` (RLS-filtered) for messages, read markers, notifications, games; typing indicators use a *private* Broadcast channel `typing:<conversation id>` authorised by an RLS policy on `realtime.messages`.

## Data lifecycle

Account deletion (`DELETE /api/account`) removes storage folders then the auth user; profile data cascades. Messages keep content but `sender_id` becomes null. Expired Moments are purged (+1 h grace) with their files.
