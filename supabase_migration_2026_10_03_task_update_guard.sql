begin;
create or replace function public.task_update_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.role()='service_role' or (auth.uid() is null and auth.role() is null and session_user in ('postgres','supabase_admin')) then return new; end if;
  if public.active_member() is not true then raise exception 'TASK_UPDATE_FORBIDDEN' using errcode='42501'; end if;
  if public.current_user_has_permission('can_create_tasks')
    or public.current_user_has_permission('can_manage_accounts')
    or old.created_by=auth.uid() or public.can_manage_committee(old.team_id) then return new; end if;

  -- Being assigned a task allows progress updates, not reassignment or deadline edits.
  if not coalesce(auth.uid()=any(old.assigned_to), false)
    or (to_jsonb(new)-array['status','completed_at','updated_at']) is distinct from (to_jsonb(old)-array['status','completed_at','updated_at']) then
    raise exception 'TASK_UPDATE_FORBIDDEN' using errcode='42501';
  end if;
  if new.status='completed' then
    new.completed_at := case when old.status='completed' then old.completed_at else now() end;
  else
    new.completed_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.task_update_guard() from public,anon,authenticated;
drop trigger if exists task_update_guard on public.tasks;
create trigger task_update_guard before update on public.tasks for each row execute function public.task_update_guard();
commit;
