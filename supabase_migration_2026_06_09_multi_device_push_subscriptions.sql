-- Multi-device PWA push subscriptions
-- Run this once in Supabase SQL Editor.

create table if not exists public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users on delete cascade not null,
  fcm_token text not null unique,
  device_name text,
  platform text,
  is_active boolean not null default true,
  last_seen_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can view own push subscriptions." on public.push_subscriptions;
create policy "Users can view own push subscriptions." on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "Users can manage own push subscriptions." on public.push_subscriptions;
create policy "Users can manage own push subscriptions." on public.push_subscriptions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep existing user-level switch, but save each device token as its own row.
create or replace function public.update_my_notification_settings(
  p_fcm_token text,
  p_notification_enabled boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set fcm_token = p_fcm_token,
      notification_enabled = p_notification_enabled
  where id = auth.uid();

  if p_fcm_token is not null and length(trim(p_fcm_token)) > 0 then
    insert into public.push_subscriptions (
      user_id,
      fcm_token,
      device_name,
      platform,
      is_active,
      last_seen_at
    )
    values (
      auth.uid(),
      p_fcm_token,
      null,
      null,
      p_notification_enabled,
      now()
    )
    on conflict (fcm_token)
    do update set
      user_id = excluded.user_id,
      is_active = excluded.is_active,
      last_seen_at = now();
  end if;
end;
$$;

grant execute on function public.update_my_notification_settings(text, boolean) to authenticated;

-- Migrate old single-token records into the new device table.
insert into public.push_subscriptions (
  user_id,
  fcm_token,
  device_name,
  platform,
  is_active,
  last_seen_at
)
select
  id,
  fcm_token,
  'Legacy device',
  'legacy',
  notification_enabled,
  now()
from public.users
where fcm_token is not null
  and length(trim(fcm_token)) > 0
on conflict (fcm_token)
do update set
  user_id = excluded.user_id,
  is_active = excluded.is_active,
  last_seen_at = now();
