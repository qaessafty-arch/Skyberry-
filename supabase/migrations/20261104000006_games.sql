-- SKYBERRY 0006 — social games. Real, server-authoritative multiplayer: all state lives in Postgres,
-- every move is validated inside make_move(), and clients subscribe to row changes via Realtime.
-- First game: tic-tac-toe (turn-based, two players). The tables are game-agnostic (`kind`, `state`).

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('tictactoe')),
  status text not null default 'waiting' check (status in ('waiting','active','finished','cancelled')),
  created_by uuid not null references public.profiles (id) on delete cascade,
  state jsonb not null,
  turn_user uuid references public.profiles (id) on delete set null,
  winner_id uuid references public.profiles (id) on delete set null,
  result text check (result in ('win','draw','forfeit')),
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.game_participants (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seat integer not null check (seat between 0 and 7),
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id),
  unique (session_id, seat)
);
create index game_participants_user_idx on public.game_participants (user_id);
create table public.game_invites (
  session_id uuid not null references public.game_sessions (id) on delete cascade,
  invitee_id uuid not null references public.profiles (id) on delete cascade,
  primary key (session_id, invitee_id)
);
create index game_invites_invitee_idx on public.game_invites (invitee_id);

create or replace function private.in_game(p_session uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.game_participants where session_id = p_session and user_id = p_user)
      or exists (select 1 from public.game_invites where session_id = p_session and invitee_id = p_user);
$$;
grant execute on function private.in_game(uuid, uuid) to authenticated;

alter table public.game_sessions enable row level security;
alter table public.game_participants enable row level security;
alter table public.game_invites enable row level security;
revoke all on public.game_sessions, public.game_participants, public.game_invites from anon, authenticated;
grant select on public.game_sessions, public.game_participants, public.game_invites to authenticated;

create policy games_select on public.game_sessions for select to authenticated
  using (private.in_game(id, (select auth.uid())));
create policy game_participants_select on public.game_participants for select to authenticated
  using (private.in_game(session_id, (select auth.uid())));
create policy game_invites_select on public.game_invites for select to authenticated
  using (invitee_id = (select auth.uid()) or private.in_game(session_id, (select auth.uid())));

create or replace function public.create_game(p_kind text, p_invitee uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); sid uuid;
begin
  if p_kind <> 'tictactoe' then raise exception 'unknown game' using errcode = '22023'; end if;
  if p_invitee = me or not private.are_friends(me, p_invitee) then
    raise exception 'you can only challenge friends' using errcode = '42501';
  end if;
  if (select count(*) from public.game_sessions g where g.created_by = me and g.status in ('waiting','active')) >= 5 then
    raise exception 'finish or cancel a few games first' using errcode = '54000';
  end if;
  insert into public.game_sessions (kind, created_by, state)
    values ('tictactoe', me, jsonb_build_object('board', jsonb_build_array('','','','','','','','',''), 'marks', '{}'::jsonb))
    returning id into sid;
  insert into public.game_participants (session_id, user_id, seat) values (sid, me, 0);
  insert into public.game_invites (session_id, invitee_id) values (sid, p_invitee);
  perform private.notify(p_invitee, 'game_invite', me, sid, '/games/' || sid::text, 'challenged you to Tic-Tac-Toe');
  return sid;
end $$;

create or replace function public.join_game(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); g public.game_sessions; host uuid;
begin
  select * into g from public.game_sessions where id = p_session for update;
  if not found or g.status <> 'waiting' then raise exception 'game not available' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.game_invites where session_id = p_session and invitee_id = me) then
    raise exception 'not invited' using errcode = '42501';
  end if;
  host := g.created_by;
  insert into public.game_participants (session_id, user_id, seat) values (p_session, me, 1);
  update public.game_sessions set status = 'active', turn_user = host, version = version + 1, updated_at = now(),
    state = jsonb_set(state, '{marks}', jsonb_build_object(host::text, 'X', me::text, 'O'))
   where id = p_session;
end $$;

create or replace function public.cancel_game(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.game_sessions set status = 'cancelled', version = version + 1, updated_at = now()
   where id = p_session and created_by = auth.uid() and status = 'waiting';
  if not found then raise exception 'cannot cancel' using errcode = '42501'; end if;
end $$;

create or replace function private.finish_game(p_session uuid, p_winner uuid, p_result text) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  update public.game_sessions set status = 'finished', winner_id = p_winner, result = p_result,
    turn_user = null, version = version + 1, updated_at = now() where id = p_session;
  for r in select user_id from public.game_participants where session_id = p_session loop
    perform private.grant_xp(r.user_id, case when p_result = 'draw' then 10 when r.user_id = p_winner then 25 else 5 end);
    if r.user_id = p_winner then perform private.award(r.user_id, 'first_win'); end if;
  end loop;
end $$;

create or replace function public.make_move(p_session uuid, p_cell integer, p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); g public.game_sessions; board jsonb; mark text; other uuid; i int; w boolean := false;
  lines int[][] := array[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
begin
  select * into g from public.game_sessions where id = p_session for update;
  if not found or not exists (select 1 from public.game_participants where session_id = p_session and user_id = me) then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if g.status <> 'active' then raise exception 'game is not active' using errcode = '22023'; end if;
  if g.version <> p_version then raise exception 'stale state, refresh' using errcode = '40001'; end if;
  if g.turn_user is distinct from me then raise exception 'not your turn' using errcode = '42501'; end if;
  if p_cell < 0 or p_cell > 8 then raise exception 'invalid cell' using errcode = '22023'; end if;
  board := g.state -> 'board';
  if (board ->> p_cell) <> '' then raise exception 'cell taken' using errcode = '22023'; end if;
  mark := g.state -> 'marks' ->> me::text;
  board := jsonb_set(board, array[p_cell::text], to_jsonb(mark));
  select user_id into other from public.game_participants where session_id = p_session and user_id <> me;
  update public.game_sessions set state = jsonb_set(state, '{board}', board) where id = p_session;
  for i in 1..8 loop
    if (board ->> lines[i][1]) = mark and (board ->> lines[i][2]) = mark and (board ->> lines[i][3]) = mark then w := true; end if;
  end loop;
  if w then perform private.finish_game(p_session, me, 'win');
  elsif not exists (select 1 from jsonb_array_elements_text(board) e where e = '') then
    perform private.finish_game(p_session, null, 'draw');
  else
    update public.game_sessions set turn_user = other, version = version + 1, updated_at = now() where id = p_session;
  end if;
end $$;

-- A player can concede, or claim a forfeit if the opponent has not moved for 24 hours.
create or replace function public.resign_game(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); other uuid;
begin
  select user_id into other from public.game_participants where session_id = p_session and user_id <> me;
  perform 1 from public.game_sessions g where g.id = p_session and g.status = 'active'
    and exists (select 1 from public.game_participants where session_id = p_session and user_id = me) for update;
  if not found then raise exception 'cannot resign' using errcode = '42501'; end if;
  perform private.finish_game(p_session, other, 'forfeit');
end $$;

create or replace function public.claim_forfeit(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); g public.game_sessions;
begin
  select * into g from public.game_sessions where id = p_session and status = 'active' for update;
  if not found or g.turn_user = me or g.updated_at > now() - interval '24 hours'
     or not exists (select 1 from public.game_participants where session_id = p_session and user_id = me) then
    raise exception 'cannot claim yet' using errcode = '42501';
  end if;
  perform private.finish_game(p_session, me, 'forfeit');
end $$;

grant execute on function public.create_game(text, uuid), public.join_game(uuid), public.cancel_game(uuid),
  public.make_move(uuid, integer, integer), public.resign_game(uuid), public.claim_forfeit(uuid) to authenticated;

-- ── Realtime publication ───────────────────────────────────────────────────
-- postgres_changes honours RLS, so subscribers only receive rows they may SELECT.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages','conversation_members','notifications','game_sessions','moments'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
