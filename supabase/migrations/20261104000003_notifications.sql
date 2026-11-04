-- SKYBERRY 0003 — notifications and saved items.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('message','connection_request','connection_accepted','invite','game_invite','moment','milestone','streak')),
  actor_id uuid references public.profiles (id) on delete set null,
  entity_id uuid,
  link text,
  body text check (body is null or char_length(body) <= 200),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
create policy notifications_select_own on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete_own on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- The ONLY way notifications are created. Honors per-user preferences and coalesces
-- message notifications (one unread entry per conversation) to avoid spam.
create or replace function private.notify(p_user uuid, p_kind text, p_actor uuid, p_entity uuid, p_link text, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.user_settings; allowed boolean;
begin
  if p_user is null or p_user = p_actor then return; end if;
  select * into s from public.user_settings where user_id = p_user;
  if not found then return; end if;
  allowed := case p_kind
    when 'message' then s.notify_messages
    when 'connection_request' then s.notify_connections
    when 'connection_accepted' then s.notify_connections
    when 'invite' then s.notify_rooms
    when 'game_invite' then s.notify_games
    when 'moment' then s.notify_moments
    when 'milestone' then s.notify_milestones
    when 'streak' then s.notify_milestones
    else false end;
  if not allowed then return; end if;
  if p_actor is not null and private.is_blocked_between(p_user, p_actor) then return; end if;
  if p_kind = 'message' then
    update public.notifications set body = p_body, actor_id = p_actor, created_at = now()
      where user_id = p_user and kind = 'message' and entity_id = p_entity and read_at is null;
    if found then return; end if;
  end if;
  insert into public.notifications (user_id, kind, actor_id, entity_id, link, body)
    values (p_user, p_kind, p_actor, p_entity, p_link, p_body);
end $$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
$$;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function private.notify(uuid, text, uuid, uuid, text, text) to service_role;

