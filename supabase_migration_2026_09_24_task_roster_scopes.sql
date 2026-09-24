begin;
-- Preserve task IDs and history; legacy assignments to ordinary members belong to membership.
do $$ begin
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='tasks' and column_name='task_scope') then
    alter table public.tasks add column task_scope text not null default 'executive' check(task_scope in ('members','executive'));
    update public.tasks t set task_scope='members'
    where exists(select 1 from public.teams g where g.id=t.team_id and g.type='board')
      and exists(select 1 from public.users u where u.id=any(t.assigned_to) and u.role in ('ordinary_member','event_member'));
  end if;
end $$;
alter table public.tasks alter column task_scope set default 'members';
create index if not exists tasks_team_scope_idx on public.tasks(team_id,task_scope);
create or replace function public.validate_task_roster_scope()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.teams where id=new.team_id and type='board') then return new; end if;
  if TG_OP='UPDATE' then
    if new.assigned_to is not distinct from old.assigned_to and new.task_scope=old.task_scope and new.team_id=old.team_id then return new; end if;
  end if;
  if exists(select 1 from unnest(new.assigned_to) a(id) left join public.users u on u.id=a.id
    where u.id is null or not u.is_active or (new.task_scope='executive' and u.role in ('ordinary_member','event_member'))) then
    raise exception 'TASK_ROSTER_ASSIGNEE_INVALID';
  end if;
  return new;
end $$;
drop trigger if exists validate_task_roster_scope on public.tasks;
create trigger validate_task_roster_scope before insert or update on public.tasks for each row execute function public.validate_task_roster_scope();
notify pgrst,'reload schema';
commit;
