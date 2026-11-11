-- SKYBERRY database security & behaviour tests. Runs as superuser, impersonating users via t.as().
create schema t;
create function t.as(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('role', case when u is null then 'anon' else 'authenticated' end, false);
end $$;
create function t.admin() returns void language plpgsql as $$
begin perform set_config('role', 'none', false); perform set_config('request.jwt.claim.sub', '', false); end $$;
create function t.eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL [%]: got %, want %', label, got, want; end if;
  raise notice 'ok   %', label;
end $$;
-- Asserts that running `stmt` raises (permission denied, RLS violation, or a business-rule error).
create function t.throws(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok   % (denied: %)', label, sqlerrm; return; end;
  raise exception 'FAIL [%]: statement should have been rejected', label;
end $$;
create function t.count(stmt text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'select count(*) from (' || stmt || ') q' into n; return n; end $$;
create function t.peek(stmt text) returns text language plpgsql security definer set search_path = public as $$
declare r text; begin execute stmt into r; return r; end $$;  -- runs as the (superuser) owner: bypasses RLS for test setup
create function t.affected(stmt text) returns bigint language plpgsql as $$
declare n bigint; begin execute stmt; get diagnostics n = row_count; return n; end $$;
create function t.returning_count(stmt text) returns bigint language plpgsql as $$
declare n bigint; begin execute 'with x as (' || stmt || ') select count(*) from x' into n; return n; end $$;
grant usage on schema t to public;
grant execute on all functions in schema t to public;

\set alice '''00000000-0000-0000-0000-00000000000a'''
\set bob   '''00000000-0000-0000-0000-00000000000b'''
\set carol '''00000000-0000-0000-0000-00000000000c'''
\set dave  '''00000000-0000-0000-0000-00000000000d'''
\set eve   '''00000000-0000-0000-0000-00000000000e'''

-- ── sign-up bootstrap ──────────────────────────────────────────────────────
insert into auth.users (id, raw_user_meta_data) values
 (:alice, '{"username":"Alice","display_name":"Alice A"}'),
 (:bob,   '{"username":"bob_b","display_name":"Bob"}'),
 (:carol, '{"username":"carol","display_name":"Carol"}'),
 (:dave,  '{"username":"alice","display_name":"Dave (name clash)"}'),
 (:eve,   '{"username":"x","display_name":"Eve"}');
select t.eq('username normalised to lowercase', (select username from profiles where id = :alice), 'alice');
select t.eq('taken username falls back to generated one', (select username like 'user\_%' from profiles where id = :dave), true);
select t.eq('invalid username falls back', (select username like 'user\_%' from profiles where id = :eve), true);
select t.eq('settings row created', (select count(*) from user_settings), 5::bigint);

-- ── profiles & privacy ─────────────────────────────────────────────────────
select t.as(:alice::uuid);
update profiles set bio = 'hello' where id = :alice;
select t.eq('own profile editable', (select bio from profiles where id = :alice), 'hello');
select t.eq('cannot update another profile', t.affected(format('update profiles set bio = ''pwned'' where id = %L', :bob)), 0::bigint);
select t.throws('cannot change profile id', format('update profiles set id = gen_random_uuid() where id = %L', :alice));
select t.throws('cannot read auth.users', 'select * from auth.users');
select t.as(:bob::uuid);
update profiles set visibility = 'private' where id = :bob;
select t.as(:carol::uuid);
select t.eq('private profile hidden from strangers', t.count(format('select 1 from profiles where id = %L', :bob)), 0::bigint);
select t.eq('search excludes private profiles', t.count($$select 1 from search_profiles('bob')$$), 0::bigint);
select t.eq('search finds public profiles', t.count($$select 1 from search_profiles('ali')$$), 1::bigint);
select t.eq('search ignores 1-char queries', t.count($$select 1 from search_profiles('a')$$), 0::bigint);
select t.eq('wildcard injection finds nothing', t.count($$select 1 from search_profiles('%%')$$), 0::bigint);

-- ── connections ────────────────────────────────────────────────────────────
select t.as(:alice::uuid);
select request_connection(:bob) is not null as sent \gset
select t.eq('request created', (select status from connections where addressee_id = :bob), 'pending');
select t.as(:carol::uuid);
select t.eq('third party cannot see connection', t.count('select 1 from connections'), 0::bigint);
select t.throws('third party cannot accept', format('select respond_connection(%L, true)', t.peek('select id from connections limit 1')));
select t.as(:bob::uuid);
select t.eq('private profile visible to pending requester', t.count(format('select 1 from profiles where id = %L', :alice)), 1::bigint);
select respond_connection((select id from connections where addressee_id = :bob), true);
select t.eq('connection accepted', (select status from connections limit 1), 'accepted');
select t.as(:alice::uuid);
select t.eq('friend can see private-profile friend? (private stays private)', t.count(format('select 1 from profiles where id = %L', :bob)), 0::bigint);
select request_connection(:carol); select t.as(:carol::uuid);
select respond_connection((select id from connections where addressee_id = :carol), true);

-- ── direct conversations & messages ────────────────────────────────────────
select t.as(:alice::uuid);
select open_direct_conversation(:bob) as c_ab \gset
select t.eq('direct conversation is deduplicated', open_direct_conversation(:bob), :'c_ab'::uuid);
insert into messages (conversation_id, sender_id, body) values (:'c_ab', :alice, 'hi bob');
select t.throws('cannot spoof sender', format('insert into messages (conversation_id, sender_id, body) values (%L, %L, %L)', :'c_ab', :bob, 'forged'));
select t.throws('cannot insert system messages', format('insert into messages (conversation_id, sender_id, kind, body) values (%L, %L, %L, %L)', :'c_ab', :alice, 'system', 'x'));
select t.as(:carol::uuid);
select t.eq('outsider cannot read messages', t.count(format('select 1 from messages where conversation_id = %L', :'c_ab')), 0::bigint);
select t.eq('outsider cannot read members', t.count(format('select 1 from conversation_members where conversation_id = %L', :'c_ab')), 0::bigint);
select t.throws('outsider cannot post', format('insert into messages (conversation_id, sender_id, body) values (%L, %L, %L)', :'c_ab', :carol, 'intruder'));
select t.throws('outsider cannot edit message', format('select edit_message(%L, ''hacked'')', t.peek('select id from messages limit 1')));
select t.as(:bob::uuid);
select t.eq('member can read messages', t.count(format('select 1 from messages where conversation_id = %L', :'c_ab')), 1::bigint);
select t.eq('bob has 1 unread', (select unread_count from my_conversations() where id = :'c_ab'), 1::bigint);
select mark_conversation_read(:'c_ab');
select t.eq('unread cleared after read', (select unread_count from my_conversations() where id = :'c_ab'), 0::bigint);
select t.eq('notification created for recipient', t.count($$select 1 from notifications where kind = 'message'$$), 1::bigint);
select t.throws('cannot forge notifications', format('insert into notifications (user_id, kind, body) values (%L, ''message'', ''x'')', :bob));
select t.as(:alice::uuid);
insert into messages (conversation_id, sender_id, body) values (:'c_ab', :alice, 'second');
select t.as(:bob::uuid);
select t.eq('message notifications coalesce', t.count($$select 1 from notifications where kind = 'message'$$), 1::bigint);
update user_settings set notify_messages = false where user_id = :bob;
select t.as(:alice::uuid);
insert into messages (conversation_id, sender_id, body) values (:'c_ab', :alice, 'third');
select t.as(:bob::uuid);
select t.eq('notification preference respected (still 1)', t.count($$select 1 from notifications where kind = 'message'$$), 1::bigint);
update user_settings set notify_messages = true where user_id = :bob;
select t.throws('direct chat: cannot delete others messages', format('select delete_message(%L)', t.peek('select id from messages where body = ''second''')));

-- who_can_message + block
select t.as(:carol::uuid);
update user_settings set who_can_message = 'friends' where user_id = :carol;
select t.as(:dave::uuid);
select t.throws('friends-only setting blocks strangers', format('select open_direct_conversation(%L)', :carol));
select t.as(:alice::uuid);
select block_user(:carol);
select t.as(:carol::uuid);
select t.eq('blocked user cannot see block row', t.count('select 1 from connections where status = ''blocked'''), 0::bigint);
select t.eq('blocker is hidden from blocked (public profile)', t.count(format('select 1 from profiles where id = %L', :alice)), 0::bigint);
select t.as(:alice::uuid); select unblock_user(:carol);
select request_connection(:carol); select t.as(:carol::uuid);
select respond_connection((select id from connections where addressee_id = :carol and status = 'pending'), true);

-- ── groups, roles, privilege escalation ────────────────────────────────────
select t.as(:alice::uuid);
select create_conversation('group', 'Study crew', 'notes', 'private', array[:bob::uuid, :carol::uuid]) as g \gset
select t.eq('owner is member', private.member_rank(:'g', :alice), 4);
select t.as(:bob::uuid);
select t.eq('invite visible to invitee', t.count(format('select 1 from conversation_invites where conversation_id = %L', :'g')), 1::bigint);
select t.eq('invited user not yet a member', t.count(format('select 1 from messages where conversation_id = %L', :'g')), 0::bigint);
select respond_invite((select id from conversation_invites where conversation_id = :'g'), true);
select t.as(:carol::uuid);
select respond_invite((select id from conversation_invites where conversation_id = :'g'), true);
select t.as(:dave::uuid);
select t.throws('non-member cannot join private group', format('select join_room(%L)', :'g'));
select t.throws('non-member cannot self-insert membership', format('insert into conversation_members (conversation_id, user_id, role) values (%L, %L, ''owner'')', :'g', :dave));
select t.as(:bob::uuid);
select t.throws('member cannot self-promote via table', format('update conversation_members set role = ''owner'' where conversation_id = %L and user_id = %L', :'g', :bob));
select t.throws('member cannot self-promote via rpc', format('select set_member_role(%L, %L, ''admin'')', :'g', :bob));
select t.throws('member cannot invite', format('select invite_to_conversation(%L, %L)', :'g', :dave));
select t.throws('member cannot edit group', format('select update_conversation_info(%L, ''x'', '''', ''private'')', :'g'));
select t.throws('member cannot delete group', format('select delete_conversation(%L)', :'g'));
select t.throws('member cannot remove members', format('select remove_member(%L, %L)', :'g', :carol));
select t.as(:alice::uuid);
select set_member_role(:'g', :bob, 'moderator');
select t.eq('owner can promote to moderator', private.member_rank(:'g', :bob), 2);
select t.as(:bob::uuid);
select t.throws('moderator cannot promote to admin', format('select set_member_role(%L, %L, ''admin'')', :'g', :carol));
select t.throws('moderator cannot promote anyone', format('select set_member_role(%L, %L, ''moderator'')', :'g', :carol));
select invite_to_conversation(:'g', :dave);
select t.as(:carol::uuid);
insert into messages (conversation_id, sender_id, body) values (:'g', :carol, 'oops');
select t.as(:bob::uuid);
select delete_message((select id from messages where body = 'oops'));
select t.eq('moderator can moderate a member message', (select deleted_at is not null from messages where conversation_id = :'g' and sender_id = :carol), true);
select t.as(:alice::uuid);
select t.throws('owner cannot leave without transferring', format('select leave_conversation(%L)', :'g'));
select set_member_role(:'g', :carol, 'admin');
select t.as(:carol::uuid);
select t.throws('admin cannot demote owner', format('select set_member_role(%L, %L, ''member'')', :'g', :alice));
select t.throws('admin cannot remove owner', format('select remove_member(%L, %L)', :'g', :alice));
select t.throws('admin cannot create another admin', format('select set_member_role(%L, %L, ''admin'')', :'g', :bob));
select t.throws('admin cannot transfer ownership', format('select transfer_ownership(%L, %L)', :'g', :carol));
select update_conversation_info(:'g', 'Study crew 2', 'new desc', 'private');
select t.eq('admin can edit group info', (select title from conversations where id = :'g'), 'Study crew 2');
select t.throws('groups cannot be public', format('select update_conversation_info(%L, ''x'', '''', ''public'')', :'g'));
select t.as(:alice::uuid);
select transfer_ownership(:'g', :carol);
select t.eq('ownership transferred', private.member_rank(:'g', :carol), 4);
select t.eq('previous owner is admin', private.member_rank(:'g', :alice), 3);
select t.eq('exactly one owner', (select count(*) from conversation_members where conversation_id = :'g' and role = 'owner'), 1::bigint);
select leave_conversation(:'g');
select t.eq('left conversation loses access', t.count(format('select 1 from messages where conversation_id = %L', :'g')), 0::bigint);

-- ── rooms ──────────────────────────────────────────────────────────────────
select t.as(:alice::uuid);
select create_conversation('room', 'Berry Lounge', 'open hangout', 'public') as r \gset
select create_conversation('room', 'Secret Den', '', 'private') as r2 \gset
insert into messages (conversation_id, sender_id, body) values (:'r', :alice, 'welcome');
select t.as(:eve::uuid);
select t.eq('public room discoverable by anyone', t.count($$select 1 from search_rooms('berry')$$), 1::bigint);
select t.eq('private room not discoverable', t.count($$select 1 from search_rooms('secret')$$), 0::bigint);
select t.eq('room messages hidden from non-members', t.count(format('select 1 from messages where conversation_id = %L', :'r')), 0::bigint);
select t.throws('cannot join private room', format('select join_room(%L)', :'r2'));
select join_room(:'r');
select t.eq('joined public room', private.member_rank(:'r', :eve), 1);
select t.eq('member can read room history', t.count(format('select 1 from messages where conversation_id = %L and kind = ''text''', :'r')), 1::bigint);
select t.throws('room member cannot edit room', format('select update_conversation_info(%L, ''x'', '''', ''public'')', :'r'));
select t.as(:alice::uuid);
select t.eq('member_count tracked', (select member_count from conversations where id = :'r'), 2);
select update_conversation_info(:'r', 'Berry Lounge', 'open hangout', 'private');
select t.as(:dave::uuid);
select t.eq('room made private disappears from discovery', t.count($$select 1 from search_rooms('berry')$$), 0::bigint);

-- ── media, moments, expiry ─────────────────────────────────────────────────
select t.as(:alice::uuid);
insert into media_assets (id, owner_id, path, kind, mime, size_bytes) values
 ('10000000-0000-0000-0000-000000000001', :alice, :alice::text || '/m1.jpg', 'image', 'image/jpeg', 1000);
select t.eq('owner can register media and read it back (insert ... returning)', t.returning_count(format($q$insert into media_assets (owner_id, path, kind, mime, size_bytes) values (%L, %L, 'image', 'image/png', 10) returning id$q$, :alice, :alice::text || '/returning.png')), 1::bigint);
select t.throws('cannot register media under another user''s path', format('insert into media_assets (owner_id, path, kind, mime, size_bytes) values (%L, %L, ''image'', ''image/png'', 5)', :alice, :bob::text || '/x.png'));
select t.throws('rejects unsupported mime', format('insert into media_assets (owner_id, path, kind, mime, size_bytes) values (%L, %L, ''image'', ''text/html'', 5)', :alice, :alice::text || '/x.html'));
select t.throws('rejects oversized media', format('insert into media_assets (owner_id, path, kind, mime, size_bytes) values (%L, %L, ''image'', ''image/png'', 999999999)', :alice, :alice::text || '/big.png'));
select t.as(:bob::uuid);
select t.eq('stranger cannot read unshared media row', t.count($$select 1 from media_assets where id = '10000000-0000-0000-0000-000000000001'$$), 0::bigint);
select t.eq('storage path denied for non-viewer', private.can_view_media_path(:alice::text || '/m1.jpg', :bob), false);
select t.as(:alice::uuid);
insert into messages (conversation_id, sender_id, kind, media_id) values (:'c_ab', :alice, 'image', '10000000-0000-0000-0000-000000000001');
select t.as(:bob::uuid);
select t.eq('conversation member can read shared media', t.count($$select 1 from media_assets where id = '10000000-0000-0000-0000-000000000001'$$), 1::bigint);
select t.eq('storage path allowed for chat member', private.can_view_media_path(:alice::text || '/m1.jpg', :bob), true);
select t.as(:carol::uuid);
select t.eq('storage path denied for outsider', private.can_view_media_path(:alice::text || '/m1.jpg', :carol), false);
select t.throws('cannot attach someone else''s media to a message', format('insert into messages (conversation_id, sender_id, kind, media_id) values (%L, %L, ''image'', ''10000000-0000-0000-0000-000000000001'')', :'g', :carol));

select t.as(:alice::uuid);
insert into media_assets (id, owner_id, path, kind, mime, size_bytes) values
 ('10000000-0000-0000-0000-000000000002', :alice, :alice::text || '/m2.jpg', 'image', 'image/jpeg', 1000),
 ('10000000-0000-0000-0000-000000000003', :alice, :alice::text || '/m3.jpg', 'image', 'image/jpeg', 1000),
 ('10000000-0000-0000-0000-000000000004', :alice, :alice::text || '/m4.jpg', 'image', 'image/jpeg', 1000);
select create_moment('10000000-0000-0000-0000-000000000002', 'for friends', '', 'friends') as m_friends \gset
select create_moment('10000000-0000-0000-0000-000000000003', 'just carol', '', 'selected', array[:carol::uuid]) as m_sel \gset
select create_moment('10000000-0000-0000-0000-000000000004', 'private', '', 'private') as m_priv \gset
select t.as(:carol::uuid);
select t.throws('cannot use someone else''s media for a moment', 'select create_moment(''10000000-0000-0000-0000-000000000001'', '''', '''', ''friends'')');
select t.eq('friend sees friends + selected moments', t.count('select 1 from moments'), 2::bigint);
select t.as(:eve::uuid);
select t.eq('stranger sees no moments', t.count('select 1 from moments'), 0::bigint);
select t.eq('stranger cannot read moment media', private.can_view_media_path(:alice::text || '/m2.jpg', :eve), false);
select t.throws('stranger cannot record a view', format('select record_moment_view(%L)', :'m_friends'));
select t.as(:bob::uuid);
-- bob is alice's friend but not in the selected audience
select t.eq('friend sees friends moment but not selected/private', t.count('select 1 from moments'), 1::bigint);
select t.eq('selected moment media hidden from non-audience', private.can_view_media_path(:alice::text || '/m3.jpg', :bob), false);
select record_moment_view(:'m_friends');
select t.as(:alice::uuid);
select t.eq('author sees who viewed', t.count('select 1 from moment_views'), 1::bigint);
select t.as(:bob::uuid);
select t.eq('viewer rows hidden from other viewers... own row only', t.count('select 1 from moment_views'), 1::bigint);
select t.as(:carol::uuid);
select t.eq('other viewers cannot see view rows', t.count('select 1 from moment_views'), 0::bigint);
select t.eq('cannot delete another user''s moment', t.affected('delete from moments'), 0::bigint);
-- expiry
select t.admin();
update moments set created_at = now() - interval '3 days', expires_at = now() - interval '2 days' where id = :'m_friends';
select t.as(:bob::uuid);
select t.eq('expired moment invisible to audience', t.count('select 1 from moments'), 0::bigint);
select t.as(:alice::uuid);
select t.eq('expired moment invisible even to author', t.count(format('select 1 from moments where id = %L', :'m_friends')), 0::bigint);
select t.throws('clients cannot call purge', 'select * from purge_expired_moments()');
select t.admin();
select t.eq('purge removes expired moment media paths', (select count(*) from purge_expired_moments()), 1::bigint);

-- ── saved ──────────────────────────────────────────────────────────────────
select t.as(:bob::uuid);
insert into saved_items (user_id, kind, message_id) values (:bob, 'message', (select id from messages where body = 'hi bob'));
select t.throws('cannot save a message from a conversation you are not in', format('insert into saved_items (user_id, kind, message_id) values (%L, ''message'', %L)', :bob, t.peek(format('select id from messages where conversation_id = %L and kind = ''text'' limit 1', :'r'))));
select t.as(:eve::uuid);
select t.throws('cannot save others'' messages', format('insert into saved_items (user_id, kind, message_id) values (%L, ''message'', %L)', :eve, t.peek('select id from messages where body = ''hi bob''')));
select t.eq('saved items private to owner', t.count('select 1 from saved_items'), 0::bigint);
select t.as(:bob::uuid);
select t.throws('cannot save as another user', format('insert into saved_items (user_id, kind, message_id) values (%L, ''message'', %L)', :alice, (select id from messages where body = 'second')));
select t.eq('saved item listed', t.count('select 1 from saved_items'), 1::bigint);
delete from saved_items;
select t.eq('removed from saved', t.count('select 1 from saved_items'), 0::bigint);

-- ── universe: pets, streaks, milestones ────────────────────────────────────
select t.as(:alice::uuid);
select ensure_universe();
select t.throws('client cannot grant itself xp', format('update pets set xp = 99999 where owner_id = %L', :alice));
select t.throws('client cannot write streaks', 'update streaks set current_count = 99');
select t.throws('client cannot award milestones', format('insert into milestones (user_id, key) values (%L, ''streak_30'')', :alice));
select t.eq('first-message milestone persisted', (select count(*) from milestones where key = 'first_message'), 1::bigint);
select t.eq('first streak day not complete until both talk', (select count(*) from my_streaks() where effective_count > 0), 0::bigint);
select t.as(:bob::uuid);
insert into messages (conversation_id, sender_id, body) values (:'c_ab', :bob, 'hey alice');
select t.as(:alice::uuid);
select t.eq('streak day completes when both send', (select effective_count from my_streaks() limit 1), 1);
select t.eq('streak status complete', (select status from my_streaks() limit 1), 'complete');
-- pretend yesterday was completed, today not yet
select t.admin();
update streaks set last_completed_on = (now() at time zone 'utc')::date - 1, last_a_on = (now() at time zone 'utc')::date - 1, last_b_on = (now() at time zone 'utc')::date - 1;
select t.as(:alice::uuid);
select t.eq('at_risk when yesterday completed, today pending', (select status from my_streaks() limit 1), 'at_risk');
insert into messages (conversation_id, sender_id, body) values (:'c_ab', :alice, 'new day');
select t.as(:bob::uuid);
insert into messages (conversation_id, sender_id, body) values (:'c_ab', :bob, 'new day too');
select t.eq('consecutive day extends streak', (select effective_count from my_streaks() limit 1), 2);
select t.admin();
update streaks set last_completed_on = (now() at time zone 'utc')::date - 3, last_a_on = (now() at time zone 'utc')::date - 3, last_b_on = (now() at time zone 'utc')::date - 3;
select t.as(:alice::uuid);
select t.eq('gap of 2+ days shows broken (0)', (select effective_count from my_streaks() limit 1), 0);
select t.eq('longest streak remembered', (select longest_count from my_streaks() limit 1), 2);
insert into messages (conversation_id, sender_id, body) values (:'c_ab', :alice, 'back');
select t.as(:bob::uuid);
insert into messages (conversation_id, sender_id, body) values (:'c_ab', :bob, 'back too');
select t.eq('new streak restarts at 1 after a gap', (select effective_count from my_streaks() limit 1), 1);
select t.as(:eve::uuid);
select t.eq('strangers cannot see streaks', t.count('select 1 from streaks'), 0::bigint);
select t.as(:bob::uuid);
update user_settings set streaks_enabled = false where user_id = :bob;
select t.admin();
update streaks set last_completed_on = (now() at time zone 'utc')::date - 1, last_a_on = null, last_b_on = null;
select t.as(:alice::uuid);
insert into messages (conversation_id, sender_id, body) values (:'c_ab', :alice, 'tracking off for bob');
select t.eq('opting out stops tracking for both', (select count(*) from streaks where last_a_on is not null or last_b_on is not null), 0::bigint);
select care_for_pet();
select t.throws('pet care has a cooldown', 'select care_for_pet()');
select t.eq('pet xp persisted and level derived', (select private.pet_level(xp) >= 1 from pets where owner_id = :alice), true);
select t.as(:bob::uuid);
select t.eq('friends can see my pet', t.count(format('select 1 from pets where owner_id = %L', :alice)), 1::bigint);

-- ── games ──────────────────────────────────────────────────────────────────
select t.as(:alice::uuid);
select t.throws('cannot challenge a non-friend', format('select create_game(''tictactoe'', %L)', :eve));
select create_game('tictactoe', :bob) as gm \gset
select t.as(:eve::uuid);
select t.eq('outsider cannot see game', t.count('select 1 from game_sessions'), 0::bigint);
select t.throws('uninvited cannot join', format('select join_game(%L)', :'gm'));
select t.as(:bob::uuid);
select t.eq('invitee sees pending game', t.count('select 1 from game_sessions'), 1::bigint);
select join_game(:'gm');
select t.eq('game is active after join', (select status from game_sessions where id = :'gm'), 'active');
select t.throws('cannot move out of turn', format('select make_move(%L, 0, 1)', :'gm'));
select t.as(:alice::uuid);
select t.throws('stale version rejected', format('select make_move(%L, 0, 0)', :'gm'));
select make_move(:'gm', 0, 1);
select t.throws('cannot move twice in a row', format('select make_move(%L, 1, 2)', :'gm'));
select t.as(:bob::uuid);
select t.throws('cannot play a taken cell', format('select make_move(%L, 0, 2)', :'gm'));
select t.throws('cannot play out-of-range cell', format('select make_move(%L, 9, 2)', :'gm'));
select make_move(:'gm', 3, 2);
select t.as(:alice::uuid);
select make_move(:'gm', 1, 3);
select t.as(:bob::uuid); select make_move(:'gm', 4, 4);
select t.as(:alice::uuid); select make_move(:'gm', 2, 5);
select t.eq('three in a row wins', (select winner_id from game_sessions where id = :'gm'), :alice::uuid);
select t.eq('finished result', (select result from game_sessions where id = :'gm'), 'win');
select t.throws('no moves after finish', format('select make_move(%L, 8, 6)', :'gm'));
select t.throws('client cannot edit game state', format('update game_sessions set winner_id = %L', :bob));
select t.eq('winner earned first_win milestone', (select count(*) from milestones where key = 'first_win'), 1::bigint);
select t.as(:bob::uuid);
select t.eq('game invite notification', t.count($$select 1 from notifications where kind = 'game_invite'$$), 1::bigint);

-- ── abuse: rate limiting ───────────────────────────────────────────────────
select t.as(:alice::uuid);
select t.throws('message flood is rate limited', format($f$do $x$ begin for i in 1..40 loop insert into messages (conversation_id, sender_id, body) values (%L, %L, 'spam ' || i); end loop; end $x$$f$, :'c_ab', :alice));

-- ── pet accessories ────────────────────────────────────────────────────────
select t.as(:bob::uuid);
select ensure_universe();
select t.throws('cannot wear a locked accessory', format('update pets set accessory = ''star_charm'' where owner_id = %L', :bob));
select t.admin(); update pets set xp = 400 where owner_id = :bob;  -- level 5
select t.as(:bob::uuid);
update pets set accessory = 'star_charm' where owner_id = :bob;
select t.eq('unlocked accessory can be worn', (select accessory from pets where owner_id = :bob), 'star_charm');
select t.throws('unknown accessory rejected', format('update pets set accessory = ''crown'' where owner_id = %L', :bob));
select t.eq('cannot dress someone else''s pet', t.affected(format('update pets set accessory = null where owner_id = %L', :alice)), 0::bigint);

-- ── membership lifecycle (account deletion) ────────────────────────────────
select t.admin();
select create_conversation('room', 'Lifecycle Room', '', 'public') as lr from (select t.as(:carol::uuid)) x \gset
select t.as(:eve::uuid); select join_room(:'lr');
select t.as(:dave::uuid); select join_room(:'lr');
select t.admin();
delete from auth.users where id = :carol;  -- owner deletes their account
select t.eq('owner deletion hands ownership to the longest-standing member', (select user_id from conversation_members where conversation_id = :'lr' and role = 'owner'), :eve::uuid);
delete from auth.users where id in (:eve, :dave);
select t.eq('room with no members left is deleted', (select count(*) from conversations where id = :'lr'), 0::bigint);
select t.eq('no orphaned group/room conversations remain', (select count(*) from conversations c where kind <> 'direct' and not exists (select 1 from conversation_members m where m.conversation_id = c.id)), 0::bigint);

-- ── anonymous access ───────────────────────────────────────────────────────
select t.as(null);
select t.throws('anon cannot call RPCs', format('select open_direct_conversation(%L)', :bob));
select t.throws('anon cannot read profiles', 'select * from profiles');
select t.eq('anon may check username availability', username_available('fresh_name'), true);
select t.as(null);
select t.throws('anon cannot call search', $$select * from search_profiles('ali')$$);

select t.admin();
\echo ALL SECURITY TESTS PASSED
