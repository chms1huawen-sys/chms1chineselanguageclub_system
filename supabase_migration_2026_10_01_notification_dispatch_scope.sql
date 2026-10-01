begin;

alter table public.notifications add column if not exists push_actor_id uuid;

-- Capture the signed-in actor inside trusted business RPCs; callers cannot forge provenance.
create or replace function public.capture_notification_push_actor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'INSERT' then
    new.push_actor_id := auth.uid();
  else
    new.push_actor_id := old.push_actor_id;
  end if;
  return new;
end;
$$;

drop trigger if exists notification_push_actor on public.notifications;
create trigger notification_push_actor before insert or update on public.notifications
for each row execute function public.capture_notification_push_actor();

-- Business RPCs and the authenticated edge dispatcher own creation.
revoke insert on public.notifications from authenticated, anon;
revoke all on function public.create_notification_for_user(uuid,text,text,text,text) from public, authenticated, anon;

commit;
