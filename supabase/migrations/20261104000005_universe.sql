-- SKYBERRY 0005 — Social Universe: space customisation, pets (XP/levels), streaks, milestones.
--
-- RULES (also documented in docs/ARCHITECTURE.md)
--  * Streaks: a pair of friends with a direct chat. A "day" is a UTC calendar day. A day is
--    COMPLETED when BOTH people each send >= 1 message in their direct chat that day. Completing a
--    day on the day after the previous completion extends the streak (+1); completing it after any
--    longer gap starts a new streak at 1. Streaks are evaluated lazily: the displayed count is 0
--    ("broken") when the last completion is older than yesterday, "at_risk" when it was yesterday and
--    today is not yet completed. Either person can switch streak tracking off in settings, which stops
--    tracking for both. There are no penalties other than the count resetting.
--  * Pet XP: +1 per message (capped at 20/day), +5 for caring (4h cooldown), +10 per completed streak
--    day, game results (+25 win / +10 draw / +5 loss). Level = floor(sqrt(xp / 25)) + 1.
--  * XP and streak columns are NOT writable by clients; only these SECURITY DEFINER paths change them.

create table public.universe_spaces (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  theme text not null default 'dusk' check (theme in ('dusk','dawn','aurora','midnight')),
  planet text not null default 'berry' check (planet in ('berry','lagoon','ember','meadow')),
  updated_at timestamptz not null default now()
);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null default 'Pip' check (char_length(trim(name)) between 1 and 24),
  species text not null default 'berry-fox' check (species in ('berry-fox','cloud-whale','star-moth')),
  xp integer not null default 0 check (xp >= 0),
  last_cared_at timestamptz,
  msg_xp_day date,
  msg_xp_today integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.streaks (
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  current_count integer not null default 0 check (current_count >= 0),
  longest_count integer not null default 0 check (longest_count >= 0),
  last_a_on date,
  last_b_on date,
  last_completed_on date,
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index streaks_b_idx on public.streaks (user_b);

create table public.milestones (
  user_id uuid not null references public.profiles (id) on delete cascade,
  key text not null check (key in ('first_message','first_friend','streak_3','streak_7','streak_30','pet_level_5','first_win')),
  achieved_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.universe_spaces enable row level security;
alter table public.pets enable row level security;
alter table public.streaks enable row level security;
alter table public.milestones enable row level security;
revoke all on public.universe_spaces, public.pets, public.streaks, public.milestones from anon, authenticated;
grant select on public.universe_spaces, public.pets, public.streaks, public.milestones to authenticated;
grant update (theme, planet) on public.universe_spaces to authenticated;
grant update (name, species) on public.pets to authenticated;

create policy space_select on public.universe_spaces for select to authenticated
  using (user_id = (select auth.uid()) or private.are_friends(user_id, (select auth.uid())));
create policy space_update on public.universe_spaces for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy pets_select on public.pets for select to authenticated
  using (owner_id = (select auth.uid()) or private.are_friends(owner_id, (select auth.uid())));
create policy pets_update on public.pets for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy streaks_select on public.streaks for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));
create policy milestones_select on public.milestones for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function private.pet_level(p_xp integer) returns integer
language sql immutable set search_path = '' as $$ select floor(sqrt(p_xp / 25.0))::int + 1; $$;
grant execute on function private.pet_level(integer) to authenticated;

create or replace function private.ensure_universe(p_user uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.universe_spaces (user_id) values (p_user) on conflict do nothing;
  insert into public.pets (owner_id) values (p_user) on conflict do nothing;
$$;

create or replace function private.award(p_user uuid, p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare label text;
begin
  insert into public.milestones (user_id, key) values (p_user, p_key) on conflict do nothing;
  if found then
    label := case p_key
      when 'first_message' then 'Milestone: sent your first message'
      when 'first_friend' then 'Milestone: made your first connection'
      when 'streak_3' then 'Milestone: a 3-day streak'
      when 'streak_7' then 'Milestone: a 7-day streak'
      when 'streak_30' then 'Milestone: a 30-day streak'
      when 'pet_level_5' then 'Milestone: your pet reached level 5'
      when 'first_win' then 'Milestone: won your first game' end;
    perform private.notify(p_user, 'milestone', null, null, '/universe', label);
  end if;
end $$;

create or replace function private.grant_xp(p_user uuid, p_amount integer) returns void
language plpgsql security definer set search_path = '' as $$
declare lvl integer;
begin
  perform private.ensure_universe(p_user);
  update public.pets set xp = xp + p_amount where owner_id = p_user returning private.pet_level(xp) into lvl;
  if lvl >= 5 then perform private.award(p_user, 'pet_level_5'); end if;
end $$;

create or replace function private.grant_message_xp(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare today date := (now() at time zone 'utc')::date; granted boolean;
begin
  perform private.ensure_universe(p_user);
  update public.pets set
    msg_xp_today = case when msg_xp_day = today then msg_xp_today + 1 else 1 end,
    msg_xp_day = today
   where owner_id = p_user and (msg_xp_day is distinct from today or msg_xp_today < 20)
   returning true into granted;
  if granted then perform private.grant_xp(p_user, 1); end if;
end $$;

create or replace function private.touch_streak(p_sender uuid, p_other uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a uuid := least(p_sender, p_other); b uuid := greatest(p_sender, p_other);
  today date := (now() at time zone 'utc')::date;
  s public.streaks; new_count integer;
begin
  if not (select streaks_enabled from public.user_settings where user_id = p_sender)
     or not coalesce((select streaks_enabled from public.user_settings where user_id = p_other), false) then
    return;
  end if;
  if not private.are_friends(p_sender, p_other) then return; end if;
  insert into public.streaks (user_a, user_b) values (a, b) on conflict do nothing;
  select * into s from public.streaks where user_a = a and user_b = b for update;
  if p_sender = a then s.last_a_on := today; else s.last_b_on := today; end if;
  if s.last_a_on = today and s.last_b_on = today and s.last_completed_on is distinct from today then
    new_count := case when s.last_completed_on = today - 1 then s.current_count + 1 else 1 end;
    s.current_count := new_count;
    s.longest_count := greatest(s.longest_count, new_count);
    s.last_completed_on := today;
    perform private.grant_xp(a, 10);
    perform private.grant_xp(b, 10);
    if new_count >= 3 then perform private.award(a, 'streak_3'); perform private.award(b, 'streak_3'); end if;
    if new_count >= 7 then perform private.award(a, 'streak_7'); perform private.award(b, 'streak_7'); end if;
    if new_count >= 30 then perform private.award(a, 'streak_30'); perform private.award(b, 'streak_30'); end if;
  end if;
  update public.streaks set last_a_on = s.last_a_on, last_b_on = s.last_b_on, current_count = s.current_count,
    longest_count = s.longest_count, last_completed_on = s.last_completed_on where user_a = a and user_b = b;
end $$;

-- Streaks with their effective status (evaluated lazily at read time).
create or replace function public.my_streaks()
returns table (partner_id uuid, username text, display_name text, avatar_path text,
  effective_count integer, longest_count integer, status text, me_done_today boolean, partner_done_today boolean)
language sql stable security definer set search_path = '' as $$
  with t as (select (now() at time zone 'utc')::date as d)
  select p.id, p.username, p.display_name, p.avatar_path,
    case when s.last_completed_on is null or s.last_completed_on < t.d - 1 then 0 else s.current_count end,
    s.longest_count,
    case when s.last_completed_on = t.d then 'complete'
         when s.last_completed_on = t.d - 1 then 'at_risk'
         else 'broken' end,
    case when auth.uid() = s.user_a then s.last_a_on = t.d else s.last_b_on = t.d end,
    case when auth.uid() = s.user_a then s.last_b_on = t.d else s.last_a_on = t.d end
  from public.streaks s cross join t
  join public.profiles p on p.id = case when auth.uid() = s.user_a then s.user_b else s.user_a end
  where auth.uid() in (s.user_a, s.user_b)
    and coalesce((select show_streaks from public.user_settings where user_id = auth.uid()), false)
    and private.are_friends(s.user_a, s.user_b)
  order by 5 desc, p.username;
$$;

create or replace function public.ensure_universe() returns void
language sql security definer set search_path = '' as $$
  select private.ensure_universe(auth.uid());
$$;

create or replace function public.care_for_pet() returns integer
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); p public.pets; remaining integer;
begin
  perform private.ensure_universe(me);
  select * into p from public.pets where owner_id = me for update;
  if p.last_cared_at is not null and p.last_cared_at > now() - interval '4 hours' then
    raise exception 'Your pet is content for now. Come back later.' using errcode = '54000';
  end if;
  update public.pets set last_cared_at = now() where owner_id = me;
  perform private.grant_xp(me, 5);
  return (select xp from public.pets where owner_id = me);
end $$;

grant execute on function public.my_streaks(), public.ensure_universe(), public.care_for_pet() to authenticated;
grant execute on function private.award(uuid, text), private.grant_xp(uuid, integer), private.touch_streak(uuid, uuid),
  private.grant_message_xp(uuid) to service_role;
