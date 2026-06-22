-- Prevent duplicate push notifications from the same phone/browser profile.
-- Each device keeps a stable device_key in localStorage. Re-registering push
-- deactivates older tokens for that same device_key.

alter table public.push_subscriptions
  add column if not exists device_key text;

drop function if exists public.update_my_notification_settings(text, boolean);

create or replace function public.update_my_notification_settings(
  p_fcm_token text,
  p_notification_enabled boolean default true,
  p_device_key text default null,
  p_platform text default null
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
    if p_device_key is not null and length(trim(p_device_key)) > 0 then
      update public.push_subscriptions
      set is_active = false
      where user_id = auth.uid()
        and (
          device_key = p_device_key
          or device_key is null
        )
        and fcm_token <> p_fcm_token;
    elsif p_platform is not null and length(trim(p_platform)) > 0 then
      update public.push_subscriptions
      set is_active = false
      where user_id = auth.uid()
        and platform = p_platform
        and fcm_token <> p_fcm_token;
    end if;

    insert into public.push_subscriptions (
      user_id,
      fcm_token,
      device_key,
      device_name,
      platform,
      is_active,
      last_seen_at
    )
    values (
      auth.uid(),
      p_fcm_token,
      nullif(trim(coalesce(p_device_key, '')), ''),
      null,
      nullif(trim(coalesce(p_platform, '')), ''),
      p_notification_enabled,
      now()
    )
    on conflict (fcm_token)
    do update set
      user_id = excluded.user_id,
      device_key = excluded.device_key,
      platform = excluded.platform,
      is_active = excluded.is_active,
      last_seen_at = now();
  end if;
end;
$$;

grant execute on function public.update_my_notification_settings(text, boolean, text, text) to authenticated;

notify pgrst, 'reload schema';
