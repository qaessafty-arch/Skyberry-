-- SKYBERRY 0009 — pet accessories (cosmetics unlocked by level). Additive: existing pets keep
-- their XP, level, name and species; accessory starts as NULL (none).
alter table public.pets add column if not exists accessory text
  check (accessory is null or accessory in ('cloud_scarf', 'star_charm'));

create or replace function private.accessory_unlock_level(p_accessory text) returns integer
language sql immutable set search_path = '' as $$
  select case p_accessory when 'cloud_scarf' then 3 when 'star_charm' then 5 else null end;
$$;

-- Clients may change their pet's accessory column (grant below), but only to one they unlocked.
create or replace function private.guard_pet_accessory() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.accessory is distinct from old.accessory and new.accessory is not null
     and private.pet_level(new.xp) < private.accessory_unlock_level(new.accessory) then
    raise exception 'Reach level % to wear this', private.accessory_unlock_level(new.accessory) using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists pets_accessory_guard on public.pets;
create trigger pets_accessory_guard before update of accessory on public.pets
  for each row execute function private.guard_pet_accessory();

grant update (accessory) on public.pets to authenticated;
revoke execute on function private.accessory_unlock_level(text), private.guard_pet_accessory() from public, anon;
grant execute on function private.accessory_unlock_level(text) to authenticated;
