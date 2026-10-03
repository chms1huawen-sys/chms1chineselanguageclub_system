begin;

create or replace function public.update_my_avatar_url(p_avatar_url text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.active_member() then
    raise exception 'PROFILE_FORBIDDEN' using errcode='42501';
  end if;
  if length(coalesce(p_avatar_url,'')) > 2048 or
    (nullif(trim(p_avatar_url),'') is not null and
      (p_avatar_url !~ '^https://[^[:space:]]+$' or p_avatar_url ~ '[[:cntrl:]]')) then
    raise exception 'INVALID_AVATAR_URL' using errcode='22023';
  end if;
  update public.users set avatar_url=nullif(trim(coalesce(p_avatar_url,'')),'') where id=auth.uid();
end;
$$;

create or replace function public.update_my_notification_settings(
  p_fcm_token text, p_notification_enabled boolean default true,
  p_device_key text default null, p_platform text default null
) returns void language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  if auth.uid() is null or not public.active_member() then
    raise exception 'PROFILE_FORBIDDEN' using errcode='42501';
  end if;
  if p_notification_enabled is null or length(coalesce(p_fcm_token,'')) > 4096
    or length(coalesce(p_device_key,'')) > 200 or length(coalesce(p_platform,'')) > 100
    or (nullif(trim(p_fcm_token),'') is not null and p_fcm_token ~ '[[:space:][:cntrl:]]') then
    raise exception 'INVALID_PUSH_SETTINGS' using errcode='22023';
  end if;
  update public.users set fcm_token=p_fcm_token, notification_enabled=p_notification_enabled where id=auth.uid();
  if nullif(trim(p_fcm_token),'') is not null then
    if nullif(trim(p_device_key),'') is not null then
      update public.push_subscriptions set is_active=false
      where user_id=auth.uid() and (device_key=p_device_key or device_key is null) and fcm_token<>p_fcm_token;
    elsif nullif(trim(p_platform),'') is not null then
      update public.push_subscriptions set is_active=false
      where user_id=auth.uid() and platform=p_platform and fcm_token<>p_fcm_token;
    end if;
    insert into public.push_subscriptions(user_id,fcm_token,device_key,device_name,platform,is_active,last_seen_at)
    values(auth.uid(),p_fcm_token,nullif(trim(coalesce(p_device_key,'')),''),null,
      nullif(trim(coalesce(p_platform,'')),''),p_notification_enabled,now())
    on conflict(fcm_token) do update set device_key=excluded.device_key,
      platform=excluded.platform,is_active=excluded.is_active,last_seen_at=now()
    where push_subscriptions.user_id=auth.uid();
    get diagnostics affected=row_count;
    if affected=0 then
      -- Roll back profile changes and device deactivation on an ownership conflict.
      raise exception 'PUSH_REGISTRATION_CONFLICT' using errcode='42501';
    end if;
  end if;
end;
$$;

revoke all on function public.update_my_avatar_url(text) from public,anon;
revoke all on function public.update_my_notification_settings(text,boolean,text,text) from public,anon;
grant execute on function public.update_my_avatar_url(text) to authenticated;
grant execute on function public.update_my_notification_settings(text,boolean,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
