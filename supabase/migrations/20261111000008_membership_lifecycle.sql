-- SKYBERRY 0008 — keep groups/rooms consistent when members disappear (e.g. account deletion).
--  * When the last member is removed, the conversation (and its messages) is deleted.
--  * When the owner is removed and others remain, the highest-ranked, longest-standing member
--    becomes the owner, so every group/room always has exactly one owner.
create or replace function private.after_member_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare heir uuid;
begin
  if not exists (select 1 from public.conversations where id = old.conversation_id) then
    return null;  -- conversation itself is being deleted
  end if;
  if not exists (select 1 from public.conversation_members where conversation_id = old.conversation_id) then
    delete from public.conversations where id = old.conversation_id;
    return null;
  end if;
  if old.role = 'owner' then
    select m.user_id into heir from public.conversation_members m
     where m.conversation_id = old.conversation_id
     order by private.role_rank(m.role) desc, m.joined_at asc limit 1;
    update public.conversation_members set role = 'owner'
     where conversation_id = old.conversation_id and user_id = heir
       and (select kind from public.conversations where id = old.conversation_id) <> 'direct';
  end if;
  return null;
end $$;

create trigger conversation_members_lifecycle after delete on public.conversation_members
  for each row execute function private.after_member_removed();

-- One-time cleanup of conversations orphaned before this trigger existed.
delete from public.conversations c
 where not exists (select 1 from public.conversation_members m where m.conversation_id = c.id);
