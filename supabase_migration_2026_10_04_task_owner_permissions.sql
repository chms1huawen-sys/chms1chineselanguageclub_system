begin;

create or replace function public.task_update_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.role()='service_role' or (auth.uid() is null and auth.role() is null and session_user in ('postgres','supabase_admin')) then return new; end if;
  if public.active_member() is not true then raise exception 'TASK_UPDATE_FORBIDDEN' using errcode='42501'; end if;
  -- Ownership is immutable even when the publisher edits their task.
  if new.created_by is distinct from old.created_by then
    raise exception 'TASK_UPDATE_FORBIDDEN' using errcode='42501';
  end if;
  if old.created_by=auth.uid() then return new; end if;

  -- Existing managers and assignees retain progress updates, never detail edits.
  if not (coalesce(auth.uid()=any(old.assigned_to), false)
      or public.current_user_has_permission('can_create_tasks')
      or public.current_user_has_permission('can_manage_accounts')
      or public.can_manage_committee(old.team_id))
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

-- Restrictive policy prevents older permissive manager policies from granting deletion.
drop policy if exists task_delete_owner_only on public.tasks;
create policy task_delete_owner_only on public.tasks as restrictive for delete to authenticated
  using(public.active_member() and created_by=auth.uid());

commit;
