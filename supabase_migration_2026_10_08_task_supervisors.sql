begin;

create or replace function public.task_supervisor()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.users where id=auth.uid() and is_active=true
    and role in ('chairperson','convener_teacher','advisor_teacher','advisor'));
$$;
revoke all on function public.task_supervisor() from public,anon;
grant execute on function public.task_supervisor() to authenticated;

create or replace function public.task_update_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.role()='service_role' or (auth.uid() is null and auth.role() is null and session_user in ('postgres','supabase_admin')) then return new; end if;
  if public.active_member() is not true then raise exception 'TASK_UPDATE_FORBIDDEN' using errcode='42501'; end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'TASK_UPDATE_FORBIDDEN' using errcode='42501';
  end if;
  if old.created_by=auth.uid() or public.task_supervisor() then return new; end if;
  -- Other members, including vice chairpersons, may only update assigned task progress.
  if not coalesce(auth.uid()=any(old.assigned_to),false)
    or (to_jsonb(new)-array['status','completed_at','updated_at']) is distinct from (to_jsonb(old)-array['status','completed_at','updated_at']) then
    raise exception 'TASK_UPDATE_FORBIDDEN' using errcode='42501';
  end if;
  if new.status='completed' then
    new.completed_at := case when old.status='completed' then old.completed_at else now() end;
  else new.completed_at := null; end if;
  return new;
end;
$$;
revoke all on function public.task_update_guard() from public,anon,authenticated;

drop policy if exists task_supervisors_read on public.tasks;
create policy task_supervisors_read on public.tasks for select to authenticated using(public.task_supervisor());
drop policy if exists task_supervisors_update on public.tasks;
create policy task_supervisors_update on public.tasks for update to authenticated
  using(public.task_supervisor()) with check(public.task_supervisor());

-- Keep the restrictive publisher-only deletion policy from the ownership migration.
commit;
