begin;

create or replace function public.get_active_member_count()
returns integer language plpgsql stable security definer set search_path=public as $$
begin
  if auth.role() is distinct from 'service_role' and public.active_member() is not true then
    raise exception 'MEMBER_ACCESS_FORBIDDEN' using errcode='42501';
  end if;
  return (select count(*)::integer from public.users where is_active=true);
end;
$$;
revoke all on function public.get_active_member_count() from public, anon;
grant execute on function public.get_active_member_count() to authenticated, service_role;

-- Attached triggers still run; they are not browser-callable RPC endpoints.
revoke all on function public.capture_notification_push_actor() from public, anon, authenticated;
revoke all on function public.finance_permission_guard() from public, anon, authenticated;
revoke all on function public.validate_task_roster_scope() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
