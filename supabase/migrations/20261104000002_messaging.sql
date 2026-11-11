-- SKYBERRY 0002 — conversations (direct / group / room), members, invites, messages.
-- Rooms and groups share one model: a conversation with roles. Membership changes happen
-- ONLY through the RPCs below, so roles can never be self-assigned.

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct','group','room')),
  title text check (title is null or char_length(title) between 1 and 60),
  description text not null default '' check (char_length(description) <= 500),
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  cover_path text check (cover_path is null or char_length(cover_path) <= 300),
  visibility text not null default 'private' check (visibility in ('private','public')),
  direct_key text unique,
  member_count integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check ((kind = 'direct' and direct_key is not null and title is null and visibility = 'private')
      or (kind <> 'direct' and direct_key is null and title is not null)),
  check (visibility = 'private' or kind = 'room')
);
create index conversations_public_rooms_idx on public.conversations (last_message_at desc)
  where kind = 'room' and visibility = 'public';

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','moderator','member')),
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  muted boolean not null default false,
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);
-- at most one owner per conversation
create unique index conversation_one_owner on public.conversation_members (conversation_id) where role = 'owner';

create table public.conversation_invites (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (conversation_id, invitee_id)
);
create index conversation_invites_invitee_idx on public.conversation_invites (invitee_id, status);

-- media_assets is defined here (not 0004) because messages reference it.
create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  bucket text not null default 'media' check (bucket = 'media'),
  path text not null unique check (path like owner_id::text || '/%'),
  kind text not null check (kind in ('image','video')),
  mime text not null check (mime in ('image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 104857600),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  purpose text not null default 'gallery' check (purpose in ('message','moment','gallery')),
  created_at timestamptz not null default now()
);
create index media_assets_owner_idx on public.media_assets (owner_id, created_at desc);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'text' check (kind in ('text','image','video','system')),
  body text check (body is null or char_length(body) <= 4000),
  media_id uuid references public.media_assets (id) on delete set null,
  reply_to uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  check (kind <> 'text' or (deleted_at is not null) or (body is not null and char_length(trim(body)) > 0)),
  check (kind not in ('image','video') or deleted_at is not null or media_id is not null or body is not null)
);
create index messages_conv_created_idx on public.messages (conversation_id, created_at desc);
create index messages_sender_created_idx on public.messages (sender_id, created_at desc);
create index messages_media_idx on public.messages (media_id) where media_id is not null;

-- ── helper predicates ──────────────────────────────────────────────────────
create or replace function private.role_rank(r text) returns integer
language sql immutable set search_path = '' as $$
  select case r when 'owner' then 4 when 'admin' then 3 when 'moderator' then 2 when 'member' then 1 else 0 end;
$$;

create or replace function private.is_member(p_conv uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members m where m.conversation_id = p_conv and m.user_id = p_user);
$$;

create or replace function private.member_rank(p_conv uuid, p_user uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.role_rank(m.role) from public.conversation_members m
                   where m.conversation_id = p_conv and m.user_id = p_user), 0);
$$;

create or replace function private.shares_conversation(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members x
                 join public.conversation_members y on y.conversation_id = x.conversation_id
                 where x.user_id = a and y.user_id = b);
$$;

create or replace function private.owns_media(p_media uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.media_assets a where a.id = p_media and a.owner_id = p_user);
$$;

create or replace function private.message_conversation(p_msg uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select conversation_id from public.messages where id = p_msg;
$$;

grant execute on function private.role_rank(text), private.is_member(uuid, uuid), private.member_rank(uuid, uuid),
  private.shares_conversation(uuid, uuid), private.owns_media(uuid, uuid), private.message_conversation(uuid)
  to authenticated, service_role;

-- Profiles are also visible between people who share a conversation.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or (visibility = 'public' and not private.is_blocked_between(id, (select auth.uid())))
  or (visibility = 'friends' and private.are_friends(id, (select auth.uid())))
  or private.has_pending_between(id, (select auth.uid()))
  or private.shares_conversation(id, (select auth.uid()))
);

-- ── triggers ───────────────────────────────────────────────────────────────
create or replace function private.sync_member_count() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    update public.conversations set member_count = member_count + 1 where id = new.conversation_id;
  else
    update public.conversations set member_count = greatest(member_count - 1, 0) where id = old.conversation_id;
  end if;
  return null;
end $$;
create trigger conversation_members_count after insert or delete on public.conversation_members
  for each row execute function private.sync_member_count();

-- Abuse protection: at most 20 messages per 10 seconds per sender.
create or replace function private.messages_rate_limit() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind <> 'system' and new.sender_id is not null and
     (select count(*) from public.messages m
       where m.sender_id = new.sender_id and m.created_at > now() - interval '10 seconds') >= 20 then
    raise exception 'slow down: too many messages' using errcode = '54000';
  end if;
  return new;
end $$;
create trigger messages_rate_limit before insert on public.messages
  for each row execute function private.messages_rate_limit();

create or replace function private.after_message_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
declare conv public.conversations; other uuid; r record; preview text;
begin
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id
    returning * into conv;
  if new.kind = 'system' or new.sender_id is null then return null; end if;
  preview := case new.kind when 'text' then left(new.body, 120) when 'image' then 'Sent a photo' else 'Sent a video' end;
  -- the sender has obviously read the conversation up to now
  update public.conversation_members set last_read_at = new.created_at
    where conversation_id = new.conversation_id and user_id = new.sender_id;
  -- Large public rooms do not generate per-message notifications (unread badges cover them).
  for r in select user_id from public.conversation_members
           where conversation_id = new.conversation_id and user_id <> new.sender_id and not muted
             and conv.kind <> 'room' loop
    perform private.notify(r.user_id, 'message', new.sender_id, new.conversation_id,
      '/chats/' || new.conversation_id::text, preview);
  end loop;
  if conv.kind = 'direct' then
    select user_id into other from public.conversation_members
      where conversation_id = new.conversation_id and user_id <> new.sender_id limit 1;
    if other is not null then perform private.touch_streak(new.sender_id, other); end if;
  end if;
  perform private.grant_message_xp(new.sender_id);
  perform private.award(new.sender_id, 'first_message');
  return null;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function private.after_message_insert();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.conversation_invites enable row level security;
alter table public.media_assets enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations, public.conversation_members, public.conversation_invites,
  public.media_assets, public.messages from anon, authenticated;
grant select on public.conversations, public.conversation_members, public.conversation_invites,
  public.media_assets, public.messages to authenticated;
grant update (last_read_at, muted) on public.conversation_members to authenticated;
grant insert on public.messages to authenticated;

create policy conversations_select on public.conversations for select to authenticated using (
  private.is_member(id, (select auth.uid())) or (kind = 'room' and visibility = 'public')
);
create policy members_select on public.conversation_members for select to authenticated using (
  private.is_member(conversation_id, (select auth.uid()))
);
-- Members may change only their own read marker / mute flag (column grant blocks `role`).
create policy members_update_self on public.conversation_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy invites_select on public.conversation_invites for select to authenticated using (
  invitee_id = (select auth.uid()) or inviter_id = (select auth.uid())
);

create policy messages_select on public.messages for select to authenticated using (
  private.is_member(conversation_id, (select auth.uid()))
);
create policy messages_insert on public.messages for insert to authenticated with check (
  sender_id = (select auth.uid())
  and kind in ('text','image','video')
  and deleted_at is null and edited_at is null
  and private.is_member(conversation_id, (select auth.uid()))
  and (media_id is null or private.owns_media(media_id, (select auth.uid())))
  and (reply_to is null or private.message_conversation(reply_to) = conversation_id)
);

-- media_assets visibility is finalised in 0004 (needs moments); owners can always read their own.
create policy media_select_own on public.media_assets for select to authenticated
  using (owner_id = (select auth.uid()));
create policy media_insert_own on public.media_assets for insert to authenticated
  with check (owner_id = (select auth.uid()) and path like (select auth.uid())::text || '/%');
create policy media_delete_own on public.media_assets for delete to authenticated
  using (owner_id = (select auth.uid()));
grant insert, delete on public.media_assets to authenticated;

-- ── RPCs ───────────────────────────────────────────────────────────────────
create or replace function public.open_direct_conversation(p_other uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); k text; cid uuid; s public.user_settings;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_other = me then raise exception 'cannot message yourself' using errcode = '22023'; end if;
  if not exists (select 1 from public.profiles where id = p_other) then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  k := least(me::text, p_other::text) || ':' || greatest(me::text, p_other::text);
  select id into cid from public.conversations where direct_key = k;
  if cid is not null then return cid; end if;
  if private.is_blocked_between(me, p_other) then raise exception 'unavailable' using errcode = '42501'; end if;
  select * into s from public.user_settings where user_id = p_other;
  if s.who_can_message = 'friends' and not private.are_friends(me, p_other) then
    raise exception 'this person only accepts messages from friends' using errcode = '42501';
  end if;
  insert into public.conversations (kind, direct_key, created_by) values ('direct', k, me)
    on conflict (direct_key) do nothing returning id into cid;
  if cid is null then select id into cid from public.conversations where direct_key = k; return cid; end if;
  insert into public.conversation_members (conversation_id, user_id) values (cid, me), (cid, p_other);
  return cid;
end $$;

create or replace function public.create_conversation(
  p_kind text, p_title text, p_description text default '', p_visibility text default 'private',
  p_invitees uuid[] default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); cid uuid; u uuid;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_kind not in ('group','room') then raise exception 'invalid kind' using errcode = '22023'; end if;
  if p_kind = 'group' and p_visibility <> 'private' then raise exception 'groups are private' using errcode = '22023'; end if;
  if (select count(*) from public.conversations c where c.created_by = me and c.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'creating too many spaces, try again later' using errcode = '54000';
  end if;
  insert into public.conversations (kind, title, description, visibility, created_by)
    values (p_kind, trim(p_title), coalesce(p_description, ''), p_visibility, me) returning id into cid;
  insert into public.conversation_members (conversation_id, user_id, role) values (cid, me, 'owner');
  foreach u in array coalesce(p_invitees, '{}') loop
    perform private.invite_internal(cid, me, u);
  end loop;
  return cid;
end $$;

create or replace function private.invite_internal(p_conv uuid, p_inviter uuid, p_invitee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare conv public.conversations;
begin
  if p_invitee = p_inviter or private.is_member(p_conv, p_invitee) then return; end if;
  if private.is_blocked_between(p_inviter, p_invitee) then return; end if;
  if not exists (select 1 from public.profiles where id = p_invitee) then return; end if;
  select * into conv from public.conversations where id = p_conv;
  insert into public.conversation_invites (conversation_id, inviter_id, invitee_id)
    values (p_conv, p_inviter, p_invitee)
    on conflict (conversation_id, invitee_id) do update set status = 'pending', inviter_id = excluded.inviter_id, created_at = now()
    where public.conversation_invites.status <> 'pending';
  perform private.notify(p_invitee, 'invite', p_inviter, p_conv, '/notifications',
    'invited you to ' || coalesce(conv.title, 'a space'));
end $$;

create or replace function public.invite_to_conversation(p_conv uuid, p_invitee uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); k text;
begin
  select kind into k from public.conversations where id = p_conv;
  if k is null or k = 'direct' then raise exception 'cannot invite here' using errcode = '22023'; end if;
  if private.member_rank(p_conv, me) < 2 then raise exception 'not allowed' using errcode = '42501'; end if;
  perform private.invite_internal(p_conv, me, p_invitee);
end $$;

create or replace function public.respond_invite(p_invite uuid, p_accept boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); inv public.conversation_invites;
begin
  select * into inv from public.conversation_invites where id = p_invite and invitee_id = me and status = 'pending';
  if not found then raise exception 'invite not found' using errcode = 'P0002'; end if;
  if p_accept then
    update public.conversation_invites set status = 'accepted' where id = p_invite;
    insert into public.conversation_members (conversation_id, user_id) values (inv.conversation_id, me)
      on conflict do nothing;
    perform private.system_message(inv.conversation_id, (select display_name from public.profiles where id = me) || ' joined');
  else
    update public.conversation_invites set status = 'declined' where id = p_invite;
  end if;
  return inv.conversation_id;
end $$;

create or replace function private.system_message(p_conv uuid, p_body text) returns void
language sql security definer set search_path = '' as $$
  insert into public.messages (conversation_id, kind, body) values (p_conv, 'system', p_body);
$$;

create or replace function public.join_room(p_conv uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not exists (select 1 from public.conversations where id = p_conv and kind = 'room' and visibility = 'public') then
    raise exception 'room not found or private' using errcode = 'P0002';
  end if;
  insert into public.conversation_members (conversation_id, user_id) values (p_conv, me) on conflict do nothing;
  if found then
    perform private.system_message(p_conv, (select display_name from public.profiles where id = me) || ' joined');
  end if;
end $$;

create or replace function public.leave_conversation(p_conv uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); my_role text; k text; n integer;
begin
  select m.role, c.kind, c.member_count into my_role, k, n
    from public.conversation_members m join public.conversations c on c.id = m.conversation_id
    where m.conversation_id = p_conv and m.user_id = me;
  if not found then return; end if;
  if k = 'direct' then raise exception 'direct conversations cannot be left' using errcode = '22023'; end if;
  if my_role = 'owner' and n > 1 then
    raise exception 'transfer ownership before leaving' using errcode = '42501';
  end if;
  if n <= 1 then delete from public.conversations where id = p_conv; return; end if;
  delete from public.conversation_members where conversation_id = p_conv and user_id = me;
  perform private.system_message(p_conv, (select display_name from public.profiles where id = me) || ' left');
end $$;

create or replace function public.set_member_role(p_conv uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); my_rank int; target_rank int;
begin
  if p_role not in ('admin','moderator','member') then raise exception 'invalid role' using errcode = '22023'; end if;
  if not exists (select 1 from public.conversations where id = p_conv and kind <> 'direct') then
    raise exception 'not a group' using errcode = '22023';
  end if;
  my_rank := private.member_rank(p_conv, me);
  target_rank := private.member_rank(p_conv, p_user);
  if p_user = me then raise exception 'cannot change your own role' using errcode = '42501'; end if;
  if my_rank < 3 or my_rank <= target_rank or my_rank <= private.role_rank(p_role) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if target_rank = 0 then raise exception 'not a member' using errcode = 'P0002'; end if;
  update public.conversation_members set role = p_role where conversation_id = p_conv and user_id = p_user;
end $$;

create or replace function public.remove_member(p_conv uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); my_rank int := private.member_rank(p_conv, auth.uid());
        target_rank int := private.member_rank(p_conv, p_user);
begin
  if p_user = me then raise exception 'use leave instead' using errcode = '22023'; end if;
  if my_rank < 2 or my_rank <= target_rank or target_rank = 0 then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if (select kind from public.conversations where id = p_conv) = 'direct' then
    raise exception 'not a group' using errcode = '22023';
  end if;
  delete from public.conversation_members where conversation_id = p_conv and user_id = p_user;
  perform private.system_message(p_conv, (select display_name from public.profiles where id = p_user) || ' was removed');
end $$;

create or replace function public.transfer_ownership(p_conv uuid, p_new_owner uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if private.member_rank(p_conv, me) <> 4 then raise exception 'only the owner can do this' using errcode = '42501'; end if;
  if p_new_owner = me or not private.is_member(p_conv, p_new_owner) then
    raise exception 'invalid new owner' using errcode = '22023';
  end if;
  update public.conversation_members set role = 'admin' where conversation_id = p_conv and user_id = me;
  update public.conversation_members set role = 'owner' where conversation_id = p_conv and user_id = p_new_owner;
end $$;

create or replace function public.update_conversation_info(
  p_conv uuid, p_title text, p_description text, p_visibility text,
  p_avatar_path text default null, p_cover_path text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare k text; me uuid := auth.uid();
begin
  select kind into k from public.conversations where id = p_conv;
  if k is null or k = 'direct' then raise exception 'not a group' using errcode = '22023'; end if;
  if private.member_rank(p_conv, me) < 3 then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_visibility = 'public' and k <> 'room' then raise exception 'only rooms can be public' using errcode = '22023'; end if;
  if p_avatar_path is not null and p_avatar_path not like me::text || '/%' then
    raise exception 'invalid avatar path' using errcode = '22023';
  end if;
  update public.conversations set
    title = trim(p_title), description = coalesce(p_description, ''), visibility = p_visibility,
    avatar_path = coalesce(p_avatar_path, avatar_path), cover_path = coalesce(p_cover_path, cover_path)
  where id = p_conv;
end $$;

create or replace function public.delete_conversation(p_conv uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.member_rank(p_conv, auth.uid()) <> 4 then raise exception 'only the owner can do this' using errcode = '42501'; end if;
  if (select kind from public.conversations where id = p_conv) = 'direct' then
    raise exception 'direct conversations cannot be deleted' using errcode = '22023';
  end if;
  delete from public.conversations where id = p_conv;
end $$;

create or replace function public.edit_message(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if char_length(trim(coalesce(p_body, ''))) = 0 or char_length(p_body) > 4000 then
    raise exception 'invalid message' using errcode = '22023';
  end if;
  update public.messages set body = p_body, edited_at = now()
   where id = p_id and sender_id = auth.uid() and kind = 'text' and deleted_at is null;
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;

create or replace function public.delete_message(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare m public.messages; me uuid := auth.uid(); kind_ text;
begin
  select * into m from public.messages where id = p_id;
  if not found then raise exception 'not found' using errcode = 'P0002'; end if;
  select kind into kind_ from public.conversations where id = m.conversation_id;
  if not (m.sender_id = me
     or (kind_ <> 'direct' and private.member_rank(m.conversation_id, me) >= 2
         and private.member_rank(m.conversation_id, me) > private.member_rank(m.conversation_id, m.sender_id))) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.messages set deleted_at = now(), body = null, media_id = null where id = p_id;
end $$;

create or replace function public.mark_conversation_read(p_conv uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_members set last_read_at = now() where conversation_id = p_conv and user_id = auth.uid();
$$;

-- Conversation list with unread counts. SECURITY INVOKER: RLS limits it to my conversations.
create or replace function public.my_conversations()
returns table (id uuid, kind text, title text, avatar_path text, visibility text, member_count int,
  last_message_at timestamptz, last_preview text, last_sender_id uuid, unread_count bigint, muted boolean,
  my_role text, other_user_id uuid, other_username text, other_display_name text, other_avatar_path text)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.kind, c.title, c.avatar_path, c.visibility, c.member_count, c.last_message_at,
    case when lm.deleted_at is not null then 'Message deleted'
         when lm.kind = 'text' or lm.kind = 'system' then left(lm.body, 120)
         when lm.kind = 'image' then 'Photo' when lm.kind = 'video' then 'Video' end as last_preview,
    lm.sender_id,
    (select count(*) from public.messages m where m.conversation_id = c.id
       and m.created_at > me.last_read_at and m.sender_id is distinct from auth.uid() and m.deleted_at is null) as unread_count,
    me.muted, me.role,
    o.id, o.username, o.display_name, o.avatar_path
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (select * from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1) lm on true
  left join lateral (select p.* from public.conversation_members om join public.profiles p on p.id = om.user_id
                     where c.kind = 'direct' and om.conversation_id = c.id and om.user_id <> auth.uid() limit 1) o on true
  where me.user_id = auth.uid()
  order by c.last_message_at desc;
$$;

-- Discover public rooms (+ rooms I'm already in) by name.
create or replace function public.search_rooms(p_query text default '')
returns table (id uuid, title text, description text, avatar_path text, cover_path text, member_count int,
  last_message_at timestamptz, is_member boolean)
language sql stable security invoker set search_path = '' as $$
  select c.id, c.title, c.description, c.avatar_path, c.cover_path, c.member_count, c.last_message_at,
         private.is_member(c.id, auth.uid())
  from public.conversations c
  where c.kind = 'room' and c.visibility = 'public'
    and (trim(coalesce(p_query, '')) = '' or c.title ilike '%' || replace(replace(replace(trim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by c.member_count desc, c.last_message_at desc
  limit 40;
$$;

grant execute on function public.open_direct_conversation(uuid), public.create_conversation(text, text, text, text, uuid[]),
  public.invite_to_conversation(uuid, uuid), public.respond_invite(uuid, boolean), public.join_room(uuid),
  public.leave_conversation(uuid), public.set_member_role(uuid, uuid, text), public.remove_member(uuid, uuid),
  public.transfer_ownership(uuid, uuid), public.update_conversation_info(uuid, text, text, text, text, text),
  public.delete_conversation(uuid), public.edit_message(uuid, text), public.delete_message(uuid),
  public.mark_conversation_read(uuid), public.my_conversations(), public.search_rooms(text) to authenticated;

-- Realtime authorization for ephemeral typing indicators (Broadcast channel "typing:<conversation id>").
create or replace function private.can_use_typing_topic(p_topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_topic !~ '^typing:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
  return private.is_member(substr(p_topic, 8)::uuid, auth.uid());
end $$;
grant execute on function private.can_use_typing_topic(text) to authenticated;

do $$ begin
  if to_regclass('realtime.messages') is not null then
    -- On hosted Supabase realtime.messages is owned by the Realtime service and already has RLS on.
    begin
      execute 'alter table realtime.messages enable row level security';
    exception when insufficient_privilege then null;
    end;
    execute 'drop policy if exists typing_read on realtime.messages';
    execute 'drop policy if exists typing_write on realtime.messages';
    execute $p$create policy typing_read on realtime.messages for select to authenticated
      using (private.can_use_typing_topic((select realtime.topic())))$p$;
    execute $p$create policy typing_write on realtime.messages for insert to authenticated
      with check (private.can_use_typing_topic((select realtime.topic())))$p$;
  end if;
end $$;
