-- User avatar upload support
-- Run this once in Supabase SQL Editor.

alter table public.users
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatar images are publicly readable." on storage.objects;
create policy "Avatar images are publicly readable." on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatar." on storage.objects;
create policy "Users can upload own avatar." on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can update own avatar." on storage.objects;
create policy "Users can update own avatar." on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Users can delete own avatar." on storage.objects;
create policy "Users can delete own avatar." on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create or replace function public.update_my_avatar_url(
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set avatar_url = nullif(trim(coalesce(p_avatar_url, '')), '')
  where id = auth.uid();
end;
$$;

grant execute on function public.update_my_avatar_url(text) to authenticated;
