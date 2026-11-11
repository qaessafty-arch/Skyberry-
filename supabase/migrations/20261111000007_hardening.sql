-- SKYBERRY 0007 — hardening after the Supabase security/performance advisors.
-- 1) Hosted Supabase grants EXECUTE on new public functions to `anon` through its own default
--    privileges, which our 0001 "alter default privileges" does not override. Revoke explicitly:
--    signed-out visitors may only call username_available (needed by the sign-up form).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname in ('public', 'private') and d.objid is null
      and p.proname not in ('rls_auto_enable')            -- platform-provided, not ours
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;
grant execute on function public.username_available(text) to anon;

-- 2) One SELECT policy on media_assets. The owner check stays inline: an INSERT ... RETURNING must
--    see the row it just created, which a STABLE helper querying the same table cannot.
drop policy if exists media_select_own on public.media_assets;
drop policy if exists media_select_shared on public.media_assets;
create policy media_select on public.media_assets for select to authenticated
  using (owner_id = (select auth.uid()) or private.can_view_media(id, (select auth.uid())));

-- 3) Cover foreign keys used in joins/cascades.
create index if not exists conversation_invites_inviter_idx on public.conversation_invites (inviter_id);
create index if not exists conversations_created_by_idx on public.conversations (created_by);
create index if not exists game_sessions_created_by_idx on public.game_sessions (created_by);
create index if not exists game_sessions_turn_user_idx on public.game_sessions (turn_user);
create index if not exists game_sessions_winner_idx on public.game_sessions (winner_id);
create index if not exists messages_reply_to_idx on public.messages (reply_to) where reply_to is not null;
create index if not exists moment_views_viewer_idx on public.moment_views (viewer_id);
create index if not exists moments_media_idx on public.moments (media_id);
create index if not exists notifications_actor_idx on public.notifications (actor_id);
create index if not exists saved_media_idx on public.saved_items (media_id) where media_id is not null;
create index if not exists saved_message_idx on public.saved_items (message_id) where message_id is not null;
create index if not exists saved_moment_idx on public.saved_items (moment_id) where moment_id is not null;
