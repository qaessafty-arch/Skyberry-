-- SKYBERRY 0004 — media visibility, Moments (expiring stories), storage buckets and policies.

create table public.moments (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  media_id uuid not null references public.media_assets (id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 200),
  overlay_text text not null default '' check (char_length(overlay_text) <= 80),
  audience text not null default 'friends' check (audience in ('friends','selected','private')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  check (expires_at > created_at and expires_at <= created_at + interval '7 days')
);
create index moments_author_idx on public.moments (author_id, created_at desc);
create index moments_expires_idx on public.moments (expires_at);

create table public.moment_audience (
  moment_id uuid not null references public.moments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (moment_id, user_id)
);
create index moment_audience_user_idx on public.moment_audience (user_id);

create table public.moment_views (
  moment_id uuid not null references public.moments (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (moment_id, viewer_id)
);

-- ── predicates ─────────────────────────────────────────────────────────────
create or replace function private.moment_author(p_moment uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select author_id from public.moments where id = p_moment;
$$;

-- Expired moments are invisible to everyone (the purge job later deletes them physically).
create or replace function private.can_view_moment(p_moment uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.moments m
    where m.id = p_moment and m.expires_at > now()
      and (m.author_id = p_user
        or (m.audience = 'friends' and private.are_friends(m.author_id, p_user))
        or (m.audience = 'selected' and exists (
              select 1 from public.moment_audience a where a.moment_id = m.id and a.user_id = p_user))));
$$;

create or replace function private.can_view_media(p_media uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.media_assets a where a.id = p_media and a.owner_id = p_user)
      or exists (select 1 from public.messages m
                 where m.media_id = p_media and m.deleted_at is null and private.is_member(m.conversation_id, p_user))
      or exists (select 1 from public.moments mo
                 where mo.media_id = p_media and private.can_view_moment(mo.id, p_user));
$$;

create or replace function private.can_view_media_path(p_path text, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select split_part(p_path, '/', 1) = p_user::text
      or exists (select 1 from public.media_assets a where a.path = p_path and private.can_view_media(a.id, p_user));
$$;

grant execute on function private.moment_author(uuid), private.can_view_moment(uuid, uuid),
  private.can_view_media(uuid, uuid), private.can_view_media_path(text, uuid) to authenticated, service_role;

-- Shared media becomes visible to conversation members / moment audiences.
create policy media_select_shared on public.media_assets for select to authenticated
  using (private.can_view_media(id, (select auth.uid())));

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.moments enable row level security;
alter table public.moment_audience enable row level security;
alter table public.moment_views enable row level security;
revoke all on public.moments, public.moment_audience, public.moment_views from anon, authenticated;
grant select, delete on public.moments to authenticated;
grant select on public.moment_audience, public.moment_views to authenticated;

create policy moments_select on public.moments for select to authenticated
  using (private.can_view_moment(id, (select auth.uid())));
create policy moments_delete_own on public.moments for delete to authenticated
  using (author_id = (select auth.uid()));
create policy moment_audience_select on public.moment_audience for select to authenticated
  using (user_id = (select auth.uid()) or private.moment_author(moment_id) = (select auth.uid()));
create policy moment_views_select on public.moment_views for select to authenticated
  using (viewer_id = (select auth.uid()) or private.moment_author(moment_id) = (select auth.uid()));

-- ── RPCs ───────────────────────────────────────────────────────────────────
create or replace function public.create_moment(
  p_media uuid, p_caption text, p_overlay text, p_audience text,
  p_selected uuid[] default '{}', p_ttl_hours int default 24) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); mid uuid; u uuid;
begin
  if me is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if not private.owns_media(p_media, me) then raise exception 'media not found' using errcode = 'P0002'; end if;
  if p_ttl_hours < 1 or p_ttl_hours > 168 then raise exception 'invalid duration' using errcode = '22023'; end if;
  if p_audience not in ('friends','selected','private') then raise exception 'invalid audience' using errcode = '22023'; end if;
  if p_audience = 'selected' and coalesce(array_length(p_selected, 1), 0) = 0 then
    raise exception 'choose at least one person' using errcode = '22023';
  end if;
  insert into public.moments (author_id, media_id, caption, overlay_text, audience, expires_at)
    values (me, p_media, coalesce(left(p_caption, 200), ''), coalesce(left(p_overlay, 80), ''), p_audience,
            now() + make_interval(hours => p_ttl_hours))
    returning id into mid;
  update public.media_assets set purpose = 'moment' where id = p_media;
  if p_audience = 'selected' then
    foreach u in array p_selected loop
      if private.are_friends(me, u) then
        insert into public.moment_audience (moment_id, user_id) values (mid, u) on conflict do nothing;
        perform private.notify(u, 'moment', me, mid, '/camera?view=' || mid::text, 'shared a Moment with you');
      end if;
    end loop;
  elsif p_audience = 'friends' then
    for u in select case when requester_id = me then addressee_id else requester_id end
             from public.connections where status = 'accepted' and (requester_id = me or addressee_id = me) loop
      perform private.notify(u, 'moment', me, mid, '/camera?view=' || mid::text, 'shared a Moment');
    end loop;
  end if;
  return mid;
end $$;

create or replace function public.record_moment_view(p_moment uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_view_moment(p_moment, auth.uid()) then raise exception 'not found' using errcode = 'P0002'; end if;
  if private.moment_author(p_moment) = auth.uid() then return; end if;
  insert into public.moment_views (moment_id, viewer_id) values (p_moment, auth.uid()) on conflict do nothing;
end $$;

-- Moments from friends I may currently see, newest first, grouped client-side by author.
create or replace function public.moment_feed()
returns table (id uuid, author_id uuid, media_id uuid, caption text, overlay_text text, audience text,
  created_at timestamptz, expires_at timestamptz, viewed boolean, kind text)
language sql stable security invoker set search_path = '' as $$
  select m.id, m.author_id, m.media_id, m.caption, m.overlay_text, m.audience, m.created_at, m.expires_at,
         exists (select 1 from public.moment_views v where v.moment_id = m.id and v.viewer_id = auth.uid()),
         a.kind
  from public.moments m join public.media_assets a on a.id = m.media_id
  where m.expires_at > now()
  order by m.created_at desc limit 200;
$$;

-- Service-role only: removes expired moments (+1h grace) and their media rows; returns storage paths to delete.
create or replace function public.purge_expired_moments() returns table (path text)
language plpgsql security definer set search_path = '' as $$
declare ids uuid[]; media uuid[];
begin
  select array_agg(m.id), array_agg(m.media_id) into ids, media
    from public.moments m where m.expires_at < now() - interval '1 hour';
  if ids is null then return; end if;
  delete from public.moments where id = any (ids);
  return query
    with gone as (
      delete from public.media_assets a
       where a.id = any (media) and a.purpose = 'moment'
         and not exists (select 1 from public.messages x where x.media_id = a.id)
         and not exists (select 1 from public.saved_items s where s.media_id = a.id)
      returning a.path)
    select gone.path from gone;
end $$;
revoke execute on function public.purge_expired_moments() from public, anon, authenticated;
grant execute on function public.purge_expired_moments() to service_role;

grant execute on function public.create_moment(uuid, text, text, text, uuid[], int),
  public.record_moment_view(uuid), public.moment_feed() to authenticated;

-- ── storage ────────────────────────────────────────────────────────────────
-- avatars: public read (profile pictures are public by design); media: private, signed URLs only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp']),
  ('media', 'media', false, 104857600,
     array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy media_insert_own_folder on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy media_select_allowed on storage.objects for select to authenticated
  using (bucket_id = 'media' and private.can_view_media_path(name, (select auth.uid())));
create policy media_delete_own_folder on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── saved items ────────────────────────────────────────────────────────────
create table public.saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('message','media','moment')),
  message_id uuid references public.messages (id) on delete cascade,
  media_id uuid references public.media_assets (id) on delete cascade,
  moment_id uuid references public.moments (id) on delete cascade,
  collection text not null default 'Everything' check (char_length(collection) between 1 and 40),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now(),
  check (num_nonnulls(message_id, media_id, moment_id) = 1),
  check ((kind = 'message' and message_id is not null) or (kind = 'media' and media_id is not null)
      or (kind = 'moment' and moment_id is not null))
);
create unique index saved_message_once on public.saved_items (user_id, message_id) where message_id is not null;
create unique index saved_media_once on public.saved_items (user_id, media_id) where media_id is not null;
create unique index saved_moment_once on public.saved_items (user_id, moment_id) where moment_id is not null;
create index saved_user_idx on public.saved_items (user_id, created_at desc);

alter table public.saved_items enable row level security;
revoke all on public.saved_items from anon, authenticated;
grant select, insert, delete on public.saved_items to authenticated;
grant update (collection, note) on public.saved_items to authenticated;
create policy saved_select_own on public.saved_items for select to authenticated using (user_id = (select auth.uid()));
create policy saved_update_own on public.saved_items for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy saved_delete_own on public.saved_items for delete to authenticated using (user_id = (select auth.uid()));
-- You can only save things you are currently allowed to see.
create policy saved_insert_own on public.saved_items for insert to authenticated with check (
  user_id = (select auth.uid())
  and (message_id is null or private.is_member(private.message_conversation(message_id), (select auth.uid())))
  and (media_id is null or private.can_view_media(media_id, (select auth.uid())))
  and (moment_id is null or private.can_view_moment(moment_id, (select auth.uid())))
);
