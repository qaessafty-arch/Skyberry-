-- SKYBERRY game rules: Drop Four and Star Dots. Runs after 01 (reuses its users and friendship).
\set alice '''00000000-0000-0000-0000-00000000000a'''
\set bob   '''00000000-0000-0000-0000-00000000000b'''

-- ── Drop Four: vertical win ───────────────────────────────────────────────────
select t.as(:alice::uuid);
select create_game('dropfour', :bob) as d1 \gset
select t.as(:bob::uuid); select join_game(:'d1');
select t.throws('dropfour: cannot move out of turn', format('select make_move(%L, 0, 1)', :'d1'));
select t.as(:alice::uuid);
select t.throws('dropfour: column out of range', format('select make_move(%L, 7, 1)', :'d1'));
select make_move(:'d1', 0, 1);   -- alice col 0
select t.as(:bob::uuid);   select make_move(:'d1', 1, 2);
select t.as(:alice::uuid); select make_move(:'d1', 0, 3);
select t.as(:bob::uuid);   select make_move(:'d1', 1, 4);
select t.as(:alice::uuid); select make_move(:'d1', 0, 5);
select t.as(:bob::uuid);   select make_move(:'d1', 1, 6);
select t.as(:alice::uuid); select make_move(:'d1', 0, 7);
select t.eq('dropfour: four stacked wins', (select winner_id from game_sessions where id = :'d1'), :alice::uuid);
select t.eq('dropfour: result is win', (select result from game_sessions where id = :'d1'), 'win');
select t.throws('dropfour: no moves after finish', format('select make_move(%L, 2, 8)', :'d1'));

-- ── Drop Four: diagonal win ───────────────────────────────────────────────────
select t.as(:alice::uuid);
select create_game('dropfour', :bob) as d2 \gset
select t.as(:bob::uuid); select join_game(:'d2');
select t.as(:alice::uuid); select make_move(:'d2', 0, 1);   -- A c0
select t.as(:bob::uuid);   select make_move(:'d2', 1, 2);   -- B c1
select t.as(:alice::uuid); select make_move(:'d2', 1, 3);   -- A c1
select t.as(:bob::uuid);   select make_move(:'d2', 2, 4);   -- B c2
select t.as(:alice::uuid); select make_move(:'d2', 2, 5);   -- A c2
select t.as(:bob::uuid);   select make_move(:'d2', 3, 6);   -- B c3
select t.as(:alice::uuid); select make_move(:'d2', 3, 7);   -- A c3
select t.as(:bob::uuid);   select make_move(:'d2', 3, 8);   -- B c3
select t.as(:alice::uuid); select make_move(:'d2', 2, 9);   -- A c2 (row 2)
select t.as(:bob::uuid);   select make_move(:'d2', 0, 10);  -- B c0 (row 1)
select t.as(:alice::uuid); select make_move(:'d2', 3, 11);  -- A c3 (row 3): diagonal c0r0-c1r1-c2r2-c3r3
select t.eq('dropfour: diagonal wins', (select winner_id from game_sessions where id = :'d2'), :alice::uuid);

-- ── Drop Four: full column rejected ───────────────────────────────────────────
select t.as(:alice::uuid);
select create_game('dropfour', :bob) as d3 \gset
select t.as(:bob::uuid); select join_game(:'d3');
select t.as(:alice::uuid); select make_move(:'d3', 0, 1);
select t.as(:bob::uuid);   select make_move(:'d3', 0, 2);
select t.as(:alice::uuid); select make_move(:'d3', 0, 3);
select t.as(:bob::uuid);   select make_move(:'d3', 0, 4);
select t.as(:alice::uuid); select make_move(:'d3', 0, 5);
select t.as(:bob::uuid);   select make_move(:'d3', 0, 6);
select t.as(:alice::uuid);
select t.throws('dropfour: full column rejected', format('select make_move(%L, 0, 7)', :'d3'));
select t.eq('dropfour: game still active after rejected move', (select status from game_sessions where id = :'d3'), 'active');

-- ── Star Dots (dot box): scoring, extra turn, full game ───────────────────────
select t.as(:alice::uuid);
select create_game('dotbox', :bob) as db \gset
select t.as(:bob::uuid); select join_game(:'db');
select t.throws('dotbox: line index out of range', format('select make_move(%L, 24, 1)', :'db'));
select t.as(:alice::uuid);
select make_move(:'db', 0, 1);    -- top of box 0
select t.as(:bob::uuid);   select make_move(:'db', 3, 2);    -- bottom of box 0
select t.as(:alice::uuid); select make_move(:'db', 12, 3);   -- left of box 0
select t.as(:bob::uuid);   select make_move(:'db', 13, 4);   -- right of box 0: completes it
select t.eq('dotbox: completing a box grants another turn', (select turn_user from game_sessions where id = :'db'), :bob::uuid);
select t.eq('dotbox: box 0 owned by guest (O)', (select state->'boxes'->>0 from game_sessions where id = :'db'), 'O');
select make_move(:'db', 1, 5);    -- bob plays again (no box) -> turn passes
select t.eq('dotbox: turn passes after a plain line', (select turn_user from game_sessions where id = :'db'), :alice::uuid);
select t.as(:alice::uuid);
select t.throws('dotbox: cannot redraw a line', format('select make_move(%L, 0, 6)', :'db'));

-- Play the rest of that game to the end: each step picks the first free line for whoever has the turn.
select t.admin();
do $$
declare gid uuid; tu uuid; v int; b jsonb; e int;
begin
  loop
    select id, turn_user, version, state->'board' into gid, tu, v, b from game_sessions where kind = 'dotbox' and status = 'active';
    exit when gid is null;
    select (i - 1)::int into e from jsonb_array_elements_text(b) with ordinality as x(val, i) where val = '' order by i limit 1;
    exit when e is null;
    perform set_config('request.jwt.claim.sub', tu::text, false);
    perform set_config('role', 'authenticated', false);
    perform make_move(gid, e, v);
    perform set_config('role', 'none', false);
  end loop;
end $$;
select t.eq('dotbox: game finished', (select status from game_sessions where kind = 'dotbox' and id = :'db'), 'finished');
select t.eq('dotbox: every box claimed', (select count(*) from game_sessions g, jsonb_array_elements_text(g.state->'boxes') b where g.id = :'db' and b <> ''), 9::bigint);
select t.eq('dotbox: winner is the player with more boxes (or draw)',
  (select case when result = 'draw' then true
               else (winner_id = :alice::uuid) = ((select count(*) filter (where b = 'X') from jsonb_array_elements_text(state->'boxes') b)
                                                > (select count(*) filter (where b = 'O') from jsonb_array_elements_text(state->'boxes') b)) end
     from game_sessions where id = :'db'), true);

-- Clean up anything still open between runs is not needed: each run starts from an empty database.
select t.as(null);
select t.admin();
\echo ALL GAME TESTS PASSED
