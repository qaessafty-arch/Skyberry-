-- SKYBERRY 0010 — reactions, presence, onboarding, invite links, reports. Additive only.

-- ── message reactions ────────────────────────────────────────────────────────
create table public.message_reactions (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('heart','laugh','wow','sad','thumbs_up','fire')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index message_reactions_msg_idx on public.message_reactions (message_id);
create index message_reactions_user_idx on public.message_reactions (user_id);
alter table public.message_reactions enable row level security;
revoke all on public.message_reactions from anon, authenticated;
grant select, insert, delete on public.message_reactions to authenticated;
-- Only conversation members see / add reactions; you can only add or remove your own.
create policy reactions_select on public.message_reactions for select to authenticated
  using (private.is_member(private.message_conversation(message_id), (select auth.uid())));
create policy reactions_insert on public.message_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_member(private.message_conversation(message_id), (select auth.uid())));
create policy reactions_delete on public.message_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── presence (last seen) — visible to yourself and your connections only ─────
alter table public.user_settings add column if not exists show_online boolean not null default true;
alter table public.user_settings add column if not exists onboarded_at timestamptz;
grant update (show_online) on public.user_settings to authenticated;

create table public.presence (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.presence enable row level security;
revoke all on public.presence from anon, authenticated;
grant select on public.presence to authenticated;
-- user_settings is private to its owner, so the visibility flag is read through a definer helper.
create or replace function private.shows_online(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select show_online from public.user_settings where user_id = p_user), false);
$$;
grant execute on function private.shows_online(uuid) to authenticated;
create policy presence_select on public.presence for select to authenticated using (
  user_id = (select auth.uid())
  or (private.are_friends(user_id, (select auth.uid())) and private.shows_online(user_id))
);
create or replace function public.heartbeat() returns void
language sql security definer set search_path = '' as $$
  insert into public.presence (user_id, last_seen_at) values (auth.uid(), now())
  on conflict (user_id) do update set last_seen_at = excluded.last_seen_at
  where public.presence.last_seen_at < now() - interval '20 seconds';
$$;
create or replace function public.complete_onboarding() returns void
language sql security definer set search_path = '' as $$
  update public.user_settings set onboarded_at = coalesce(onboarded_at, now()) where user_id = auth.uid();
$$;
-- Existing accounts have already been using the app: don't send them through onboarding.
update public.user_settings set onboarded_at = now() where onboarded_at is null;

-- ── invite links for groups & rooms ──────────────────────────────────────────
create table public.conversation_links (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null default now() + interval '7 days',
  max_uses integer not null default 25 check (max_uses between 1 and 500),
  uses integer not null default 0,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index conversation_links_conv_idx on public.conversation_links (conversation_id);
alter table public.conversation_links enable row level security;
revoke all on public.conversation_links from anon, authenticated;
grant select on public.conversation_links to authenticated;
-- Only moderators+ of the space can see its links (tokens are bearer secrets).
create policy links_select on public.conversation_links for select to authenticated
  using (private.member_rank(conversation_id, (select auth.uid())) >= 2);

create or replace function public.create_invite_link(p_conv uuid, p_days integer default 7, p_max_uses integer default 25) returns text
language plpgsql security definer set search_path = '' as $$
declare tok text; k text;
begin
  select kind into k from public.conversations where id = p_conv;
  if k is null or k = 'direct' then raise exception 'cannot invite here' using errcode = '22023'; end if;
  if private.member_rank(p_conv, auth.uid()) < 2 then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_days < 1 or p_days > 30 then raise exception 'invalid duration' using errcode = '22023'; end if;
  insert into public.conversation_links (conversation_id, created_by, expires_at, max_uses)
    values (p_conv, auth.uid(), now() + make_interval(days => p_days), p_max_uses) returning token into tok;
  return tok;
end $$;

create or replace function public.revoke_invite_link(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversation_links l set revoked = true
   where l.token = p_token and private.member_rank(l.conversation_id, auth.uid()) >= 2;
  if not found then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;

-- Preview for the join page: only what's needed, and only for a valid link.
create or replace function public.invite_link_preview(p_token text)
returns table (conversation_id uuid, title text, description text, member_count integer, kind text, already_member boolean)
language sql stable security definer set search_path = '' as $$
  select c.id, c.title, c.description, c.member_count, c.kind, private.is_member(c.id, auth.uid())
  from public.conversation_links l join public.conversations c on c.id = l.conversation_id
  where auth.uid() is not null and l.token = p_token and not l.revoked and l.expires_at > now() and l.uses < l.max_uses;
$$;

create or replace function public.join_by_link(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); l public.conversation_links;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  select * into l from public.conversation_links where token = p_token for update;
  if not found or l.revoked or l.expires_at <= now() or l.uses >= l.max_uses then
    raise exception 'This invite link is no longer valid.' using errcode = 'P0002';
  end if;
  if private.is_member(l.conversation_id, me) then return l.conversation_id; end if;
  if private.is_blocked_between(me, l.created_by) then raise exception 'unavailable' using errcode = '42501'; end if;
  insert into public.conversation_members (conversation_id, user_id) values (l.conversation_id, me);
  update public.conversation_links set uses = uses + 1 where token = p_token;
  perform private.system_message(l.conversation_id, (select display_name from public.profiles where id = me) || ' joined with an invite link');
  return l.conversation_id;
end $$;

-- ── reports ──────────────────────────────────────────────────────────────────
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_user_id uuid references public.profiles (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,
  reason text not null check (reason in ('spam','harassment','inappropriate','impersonation','other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open','reviewed','actioned','dismissed')),
  created_at timestamptz not null default now(),
  check (target_user_id is not null or message_id is not null)
);
create index reports_status_idx on public.reports (status, created_at desc);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;
create policy reports_select_own on public.reports for select to authenticated using (reporter_id = (select auth.uid()));

create or replace function public.submit_report(p_target_user uuid, p_message uuid, p_reason text, p_details text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); rid uuid; author uuid;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if p_message is not null then
    if not private.is_member(private.message_conversation(p_message), me) then raise exception 'not found' using errcode = 'P0002'; end if;
    select sender_id into author from public.messages where id = p_message;
  end if;
  if (select count(*) from public.reports where reporter_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too many reports, try again later' using errcode = '54000';
  end if;
  insert into public.reports (reporter_id, target_user_id, message_id, reason, details)
    values (me, coalesce(p_target_user, author), p_message, p_reason, left(coalesce(p_details, ''), 500)) returning id into rid;
  return rid;
end $$;

grant execute on function public.heartbeat(), public.complete_onboarding(), public.create_invite_link(uuid, integer, integer),
  public.revoke_invite_link(text), public.invite_link_preview(text), public.join_by_link(text),
  public.submit_report(uuid, uuid, text, text) to authenticated;
revoke execute on function public.heartbeat(), public.complete_onboarding(), public.create_invite_link(uuid, integer, integer),
  public.revoke_invite_link(text), public.invite_link_preview(text), public.join_by_link(text),
  public.submit_report(uuid, uuid, text, text) from public, anon;

-- realtime: reactions update live in open chats
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'message_reactions') then
    execute 'alter publication supabase_realtime add table public.message_reactions';
  end if;
end $$;
