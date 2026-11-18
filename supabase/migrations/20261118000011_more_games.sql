-- SKYBERRY 0011 — two more social games, same server-authoritative model as tic-tac-toe:
--   dropfour  — drop discs into a 7-column, 6-row grid; first to connect four wins.
--   dotbox    — "Star Dots": take turns drawing lines on a 4x4 dot grid; completing a box scores it and
--               grants another turn. Most boxes wins.
-- Every move is validated inside make_move(). Clients only send a cell/column/edge index.

alter table public.game_sessions drop constraint if exists game_sessions_kind_check;
alter table public.game_sessions add constraint game_sessions_kind_check
  check (kind in ('tictactoe', 'dropfour', 'dotbox'));

-- Initial state per game. 'board' holds cells (tic-tac-toe, drop four) or edges (dot box, 24 lines).
-- 'boxes' is used only by dot box (9 boxes, owner mark or '').
create or replace function private.new_game_state(p_kind text) returns jsonb
language sql immutable set search_path = '' as $$
  select case p_kind
    when 'tictactoe' then jsonb_build_object('board', to_jsonb(array_fill(''::text, array[9])), 'marks', '{}'::jsonb)
    when 'dropfour'  then jsonb_build_object('board', to_jsonb(array_fill(''::text, array[42])), 'marks', '{}'::jsonb)
    when 'dotbox'    then jsonb_build_object('board', to_jsonb(array_fill(''::text, array[24])),
                                           'boxes', to_jsonb(array_fill(''::text, array[9])), 'marks', '{}'::jsonb)
  end;
$$;

-- Length of the run of `p_mark` through (p_r, p_c) along (p_dr, p_dc), counting both ways.
-- Bounds are checked before every read, so no out-of-range index is ever evaluated.
create or replace function private.line_len(p_board jsonb, p_mark text, p_r int, p_c int, p_dr int, p_dc int,
                                            p_cols int, p_rows int) returns int
language plpgsql immutable set search_path = '' as $$
declare n int := 1; rr int; cc int;
begin
  rr := p_r + p_dr; cc := p_c + p_dc;
  loop
    exit when rr < 0 or rr >= p_rows or cc < 0 or cc >= p_cols;
    exit when (p_board ->> (rr * p_cols + cc)) is distinct from p_mark;
    n := n + 1; rr := rr + p_dr; cc := cc + p_dc;
  end loop;
  rr := p_r - p_dr; cc := p_c - p_dc;
  loop
    exit when rr < 0 or rr >= p_rows or cc < 0 or cc >= p_cols;
    exit when (p_board ->> (rr * p_cols + cc)) is distinct from p_mark;
    n := n + 1; rr := rr - p_dr; cc := cc - p_dc;
  end loop;
  return n;
end $$;

create or replace function public.create_game(p_kind text, p_invitee uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); sid uuid; title text;
begin
  if p_kind not in ('tictactoe', 'dropfour', 'dotbox') then raise exception 'unknown game' using errcode = '22023'; end if;
  if p_invitee = me or not private.are_friends(me, p_invitee) then
    raise exception 'you can only challenge friends' using errcode = '42501';
  end if;
  if (select count(*) from public.game_sessions g where g.created_by = me and g.status in ('waiting','active')) >= 5 then
    raise exception 'finish or cancel a few games first' using errcode = '54000';
  end if;
  insert into public.game_sessions (kind, created_by, state)
    values (p_kind, me, private.new_game_state(p_kind))
    returning id into sid;
  insert into public.game_participants (session_id, user_id, seat) values (sid, me, 0);
  insert into public.game_invites (session_id, invitee_id) values (sid, p_invitee);
  title := case p_kind when 'tictactoe' then 'Tic-Tac-Toe' when 'dropfour' then 'Drop Four' else 'Star Dots' end;
  perform private.notify(p_invitee, 'game_invite', me, sid, '/games/' || sid::text, 'challenged you to ' || title);
  return sid;
end $$;

create or replace function public.make_move(p_session uuid, p_cell integer, p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid(); g public.game_sessions; board jsonb; boxes jsonb; mark text; other uuid; other_mark text;
  i int; r int; c int; k int; placed int; w boolean := false; extra boolean := false;
  mine int; theirs int; br int; bc int; cand int[][];
  lines int[][] := array[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  dirs int[][] := array[[0,1],[1,0],[1,1],[1,-1]];
begin
  select * into g from public.game_sessions where id = p_session for update;
  if not found or not exists (select 1 from public.game_participants where session_id = p_session and user_id = me) then
    raise exception 'game not found' using errcode = 'P0002';
  end if;
  if g.status <> 'active' then raise exception 'game is not active' using errcode = '22023'; end if;
  if g.version <> p_version then raise exception 'stale state, refresh' using errcode = '40001'; end if;
  if g.turn_user is distinct from me then raise exception 'not your turn' using errcode = '42501'; end if;

  board := g.state -> 'board';
  boxes := g.state -> 'boxes';
  mark := g.state -> 'marks' ->> me::text;
  other_mark := case when mark = 'X' then 'O' else 'X' end;
  select user_id into other from public.game_participants where session_id = p_session and user_id <> me;

  if g.kind = 'tictactoe' then
    if p_cell < 0 or p_cell > 8 then raise exception 'invalid cell' using errcode = '22023'; end if;
    if (board ->> p_cell) <> '' then raise exception 'cell taken' using errcode = '22023'; end if;
    board := jsonb_set(board, array[p_cell::text], to_jsonb(mark));
    for i in 1..8 loop
      if (board ->> lines[i][1]) = mark and (board ->> lines[i][2]) = mark and (board ->> lines[i][3]) = mark then w := true; end if;
    end loop;

  elsif g.kind = 'dropfour' then
    -- p_cell is a column (0..6); the disc falls to the lowest empty row (row 0 is the bottom).
    if p_cell < 0 or p_cell > 6 then raise exception 'invalid column' using errcode = '22023'; end if;
    placed := -1;
    for r in 0..5 loop
      if (board ->> (r * 7 + p_cell)) = '' then placed := r * 7 + p_cell; exit; end if;
    end loop;
    if placed < 0 then raise exception 'column is full' using errcode = '22023'; end if;
    board := jsonb_set(board, array[placed::text], to_jsonb(mark));
    r := placed / 7; c := placed % 7;
    for k in 1..4 loop
      if private.line_len(board, mark, r, c, dirs[k][1], dirs[k][2], 7, 6) >= 4 then w := true; end if;
    end loop;

  elsif g.kind = 'dotbox' then
    -- Edges: horizontal h(r,c) = 3r + c (r 0..3, c 0..2) -> 0..11; vertical v(r,c) = 12 + 4r + c (r 0..2, c 0..3) -> 12..23.
    -- Box (br,bc) has sides h(br,bc), h(br+1,bc), v(br,bc), v(br,bc+1); its index is 3*br + bc.
    if p_cell < 0 or p_cell > 23 then raise exception 'invalid line' using errcode = '22023'; end if;
    if (board ->> p_cell) <> '' then raise exception 'line already drawn' using errcode = '22023'; end if;
    board := jsonb_set(board, array[p_cell::text], to_jsonb(mark));
    if p_cell < 12 then
      r := p_cell / 3; c := p_cell % 3;
      cand := array[[r - 1, c], [r, c]];
    else
      r := (p_cell - 12) / 4; c := (p_cell - 12) % 4;
      cand := array[[r, c - 1], [r, c]];
    end if;
    for k in 1..2 loop
      br := cand[k][1]; bc := cand[k][2];
      if br between 0 and 2 and bc between 0 and 2 and (boxes ->> (3 * br + bc)) = '' then
        if (board ->> (3 * br + bc)) <> '' and (board ->> (3 * (br + 1) + bc)) <> ''
           and (board ->> (12 + 4 * br + bc)) <> '' and (board ->> (12 + 4 * br + bc + 1)) <> '' then
          boxes := jsonb_set(boxes, array[(3 * br + bc)::text], to_jsonb(mark));
          extra := true;  -- completing a box earns another turn
        end if;
      end if;
    end loop;

  else
    raise exception 'unknown game' using errcode = '22023';
  end if;

  update public.game_sessions
     set state = case when g.kind = 'dotbox' then jsonb_set(jsonb_set(state, '{board}', board), '{boxes}', boxes)
                      else jsonb_set(state, '{board}', board) end
   where id = p_session;

  if w then
    perform private.finish_game(p_session, me, 'win');
  elsif g.kind = 'dotbox' and not exists (select 1 from jsonb_array_elements_text(board) e where e = '') then
    select count(*) filter (where b = mark), count(*) filter (where b = other_mark)
      into mine, theirs from jsonb_array_elements_text(boxes) b;
    if mine > theirs then perform private.finish_game(p_session, me, 'win');
    elsif theirs > mine then perform private.finish_game(p_session, other, 'win');
    else perform private.finish_game(p_session, null, 'draw'); end if;
  elsif g.kind <> 'dotbox' and not exists (select 1 from jsonb_array_elements_text(board) e where e = '') then
    perform private.finish_game(p_session, null, 'draw');
  elsif extra then
    update public.game_sessions set version = version + 1, updated_at = now() where id = p_session;  -- same player moves again
  else
    update public.game_sessions set turn_user = other, version = version + 1, updated_at = now() where id = p_session;
  end if;
end $$;
