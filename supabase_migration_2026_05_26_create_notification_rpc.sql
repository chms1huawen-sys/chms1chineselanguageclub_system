-- Create notifications through a controlled RPC so app features can notify other users
-- without being blocked by row-level security on public.notifications.

create or replace function public.create_notification_for_user(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text,
  p_dedupe_key text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.notifications (user_id, type, title, body, dedupe_key)
  values (p_user_id, p_type, p_title, p_body, p_dedupe_key)
  on conflict (dedupe_key) do nothing;
end;
$$;

grant execute on function public.create_notification_for_user(uuid, text, text, text, text) to authenticated;
