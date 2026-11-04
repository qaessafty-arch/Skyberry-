-- SKYBERRY 0001 — foundation: profiles, settings, connections, helpers.
-- Security model: every table has RLS enabled. Clients get READ access via policies and
-- perform WRITES through SECURITY DEFINER RPCs that derive identity from auth.uid().
-- Grants are explicit and least-privilege (nothing relies on Supabase default grants).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- No function is executable by default; each one is granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ── profiles ───────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 48),
  bio text not null default '' check (char_length(bio) <= 280),
  status_text text not null default '' check (char_length(status_text) <= 80),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  banner_path text check (banner_path is null or char_length(banner_path) <= 300),
  accent text not null default 'berry' check (accent in ('berry','sky','mint','sun','violet')),
  visibility text not null default 'public' check (visibility in ('public','friends','private')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- ── user settings ──────────────────────────────────────────────────────────
create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  who_can_message text not null default 'everyone' check (who_can_message in ('everyone','friends')),
  notify_messages boolean not null default true,
  notify_connections boolean not null default true,
  notify_rooms boolean not null default true,
  notify_games boolean not null default true,
  notify_moments boolean not null default true,
  notify_milestones boolean not null default true,
  streaks_enabled boolean not null default true,
  show_streaks boolean not null default true,
  reduce_motion boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger user_settings_touch before update on public.user_settings
  for each row execute function private.touch_updated_at();

-- ── connections (friendships + blocks) ─────────────────────────────────────
-- For status = 'blocked', requester_id is the blocker.
create table public.connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);
create unique index connections_pair_key
  on public.connections (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index connections_addressee_idx on public.connections (addressee_id, status);
create index connections_requester_idx on public.connections (requester_id, status);

-- ── helper predicates (SECURITY DEFINER so RLS policies can use them without recursion) ──
create or replace function private.are_friends(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'accepted'
      and ((c.requester_id = a and c.addressee_id = b) or (c.requester_id = b and c.addressee_id = a)));
$$;

create or replace function private.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'blocked'
      and ((c.requester_id = a and c.addressee_id = b) or (c.requester_id = b and c.addressee_id = a)));
$$;

create or replace function private.has_pending_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.connections c
    where c.status = 'pending'
      and ((c.requester_id = a and c.addressee_id = b) or (c.requester_id = b and c.addressee_id = a)));
$$;

grant execute on function private.are_friends(uuid, uuid), private.is_blocked_between(uuid, uuid),
  private.has_pending_between(uuid, uuid) to authenticated, service_role;

-- ── new-user bootstrap ─────────────────────────────────────────────────────
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  want text := lower(coalesce(new.raw_user_meta_data ->> 'username', ''));
  uname text;
  dname text := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Skyberry user');
begin
  if want ~ '^[a-z0-9_]{3,24}$' and not exists (select 1 from public.profiles where username = want) then
    uname := want;
  else
    loop  -- generated fallback; retry until unique
      uname := 'user_' || substr(md5(random()::text || new.id::text), 1, 12);
      exit when not exists (select 1 from public.profiles where username = uname);
    end loop;
  end if;
  insert into public.profiles (id, username, display_name) values (new.id, uname, left(dname, 48));
  insert into public.user_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- Username availability check usable before sign-up (anon). Returns only a boolean.
create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select lower(p_username) ~ '^[a-z0-9_]{3,24}$'
     and not exists (select 1 from public.profiles where username = lower(p_username));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.connections enable row level security;

revoke all on public.profiles, public.user_settings, public.connections from anon, authenticated;
grant select on public.profiles, public.user_settings, public.connections to authenticated;
grant update (display_name, bio, status_text, avatar_path, banner_path, accent, visibility, username)
  on public.profiles to authenticated;
grant update (who_can_message, notify_messages, notify_connections, notify_rooms, notify_games,
  notify_moments, notify_milestones, streaks_enabled, show_streaks, reduce_motion)
  on public.user_settings to authenticated;

-- A profile is visible to: its owner, anyone if public, friends if 'friends',
-- people you share a conversation with (added in 0002), and people with a pending request.
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (visibility = 'public' and not private.is_blocked_between(id, (select auth.uid())))
  or (visibility = 'friends' and private.are_friends(id, (select auth.uid())))
  or private.has_pending_between(id, (select auth.uid()))
);
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy settings_select_own on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy settings_update_own on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Blocked rows are invisible to the blocked party.
create policy connections_select on public.connections for select to authenticated using (
  requester_id = (select auth.uid())
  or (addressee_id = (select auth.uid()) and status <> 'blocked')
);

-- ── connection RPCs ────────────────────────────────────────────────────────
create or replace function public.request_connection(p_target uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); existing public.connections; new_id uuid;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_target = me then raise exception 'cannot connect with yourself' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  select * into existing from public.connections c
    where least(c.requester_id, c.addressee_id) = least(me, p_target)
      and greatest(c.requester_id, c.addressee_id) = greatest(me, p_target);
  if found then
    if existing.status = 'blocked' then raise exception 'unavailable' using errcode = '42501'; end if;
    if existing.status = 'accepted' then return existing.id; end if;
    if existing.requester_id = p_target then  -- they already asked me: accept
      update public.connections set status = 'accepted', responded_at = now() where id = existing.id;
      perform private.notify(p_target, 'connection_accepted', me, existing.id, '/chats', 'accepted your request');
      return existing.id;
    end if;
    return existing.id;
  end if;
  insert into public.connections (requester_id, addressee_id) values (me, p_target) returning id into new_id;
  perform private.notify(p_target, 'connection_request', me, new_id, '/notifications', 'sent you a connection request');
  return new_id;
end $$;

create or replace function public.respond_connection(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); c public.connections;
begin
  select * into c from public.connections where id = p_id and addressee_id = me and status = 'pending';
  if not found then raise exception 'request not found' using errcode = 'P0002'; end if;
  if p_accept then
    update public.connections set status = 'accepted', responded_at = now() where id = p_id;
    perform private.notify(c.requester_id, 'connection_accepted', me, p_id, '/chats', 'accepted your request');
    perform private.award(me, 'first_friend');
    perform private.award(c.requester_id, 'first_friend');
  else
    delete from public.connections where id = p_id;
  end if;
end $$;

create or replace function public.remove_connection(p_other uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  delete from public.connections c
   where c.status in ('pending','accepted')
     and ((c.requester_id = me and c.addressee_id = p_other) or (c.requester_id = p_other and c.addressee_id = me));
end $$;

create or replace function public.block_user(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if p_target = me then raise exception 'cannot block yourself' using errcode = '22023'; end if;
  delete from public.connections c
   where (c.requester_id = me and c.addressee_id = p_target) or (c.requester_id = p_target and c.addressee_id = me);
  insert into public.connections (requester_id, addressee_id, status, responded_at)
    values (me, p_target, 'blocked', now());
end $$;

create or replace function public.unblock_user(p_target uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.connections where requester_id = auth.uid() and addressee_id = p_target and status = 'blocked';
end $$;

grant execute on function public.request_connection(uuid), public.respond_connection(uuid, boolean),
  public.remove_connection(uuid), public.block_user(uuid), public.unblock_user(uuid) to authenticated;

-- ── user search (never returns private profiles, blocked users or yourself) ──
create or replace function public.search_profiles(p_query text)
returns table (id uuid, username text, display_name text, avatar_path text, relation text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.username, p.display_name, p.avatar_path,
    coalesce((select case when c.status = 'accepted' then 'friend'
                          when c.status = 'pending' and c.requester_id = auth.uid() then 'sent'
                          when c.status = 'pending' then 'received' end
              from public.connections c
              where least(c.requester_id, c.addressee_id) = least(p.id, auth.uid())
                and greatest(c.requester_id, c.addressee_id) = greatest(p.id, auth.uid())), 'none') as relation
  from public.profiles p
  where auth.uid() is not null
    and char_length(trim(p_query)) >= 2
    and p.id <> auth.uid()
    and p.visibility <> 'private'
    and not private.is_blocked_between(p.id, auth.uid())
    and (p.username like replace(replace(replace(lower(trim(p_query)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
         or p.display_name ilike '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by (p.username = lower(trim(p_query))) desc, p.username
  limit 20;
$$;
grant execute on function public.search_profiles(text) to authenticated;
