begin;

alter table public.tasks add column if not exists archived_at timestamptz;
create index if not exists tasks_open_due_idx on public.tasks(due_date) where archived_at is null;

create table if not exists public.task_performance_archive (
  id uuid primary key, team_id uuid not null, task_scope text not null,
  title text not null, assigned_to uuid[] not null, status text not null,
  due_date timestamptz, completed_at timestamptz, archived_at timestamptz not null
);
alter table public.task_performance_archive enable row level security;
revoke all on public.task_performance_archive from anon, authenticated;
grant all on public.task_performance_archive to service_role;

create or replace function public.archive_expired_tasks()
returns integer language plpgsql security definer set search_path=public as $$
declare affected integer;
begin
  with expired as (
    update public.tasks set archived_at=now()
    where archived_at is null and due_date <= now()-interval '30 days'
    returning *
  ) insert into public.task_performance_archive(id,team_id,task_scope,title,assigned_to,status,due_date,completed_at,archived_at)
    select id,team_id,task_scope,title,assigned_to,status,due_date,completed_at,archived_at from expired
    on conflict(id) do nothing;
  get diagnostics affected=row_count;
  return affected;
end;
$$;
revoke all on function public.archive_expired_tasks() from public, anon, authenticated;
grant execute on function public.archive_expired_tasks() to service_role;

-- Restrictive policies combine with existing role/assignment policies rather than replacing them.
drop policy if exists task_archive_hidden on public.tasks;
create policy task_archive_hidden on public.tasks as restrictive for all to authenticated
  using(archived_at is null and (due_date is null or due_date > now()-interval '30 days'))
  with check(archived_at is null and (due_date is null or due_date > now()-interval '30 days'));
drop policy if exists archived_task_comments_hidden on public.task_comments;
create policy archived_task_comments_hidden on public.task_comments as restrictive for all to authenticated
  using(exists(select 1 from public.tasks where id=task_id))
  with check(exists(select 1 from public.tasks where id=task_id));

create or replace function public.task_performance_records(p_team uuid,p_scope text)
returns table(id uuid,title text,assigned_to uuid[],status text,due_date timestamptz,completed_at timestamptz,archived_at timestamptz)
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.current_user_has_permission('can_manage_accounts') then raise exception 'PERFORMANCE_ACCESS_DENIED'; end if;
  return query
    select t.id,t.title,t.assigned_to,t.status,t.due_date,t.completed_at,t.archived_at from public.tasks t
    where t.team_id=p_team and t.task_scope=p_scope and t.archived_at is null
    union all
    select a.id,a.title,a.assigned_to,a.status,a.due_date,a.completed_at,a.archived_at from public.task_performance_archive a
    where a.team_id=p_team and a.task_scope=p_scope;
end;
$$;
revoke all on function public.task_performance_records(uuid,text) from public,anon;
grant execute on function public.task_performance_records(uuid,text) to authenticated;

create table if not exists public.task_repeat_plans (
  id uuid primary key default gen_random_uuid(), created_by uuid not null references public.users,
  team_id uuid not null references public.teams on delete cascade, task_scope text not null check(task_scope in ('members','executive')),
  title text not null, description text, assigned_to uuid[] not null,
  priority text not null check(priority in ('high','medium','low')),
  first_publish_at timestamptz not null, due_weekday integer not null check(due_weekday between 0 and 6),
  due_time time not null, occurrence_count integer not null check(occurrence_count between 1 and 12),
  cancelled_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.task_repeat_occurrences (
  id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.task_repeat_plans on delete cascade,
  sequence integer not null, publish_at timestamptz not null, due_date timestamptz not null,
  status text not null default 'scheduled' check(status in ('scheduled','published','cancelled')),
  task_id uuid, unique(plan_id,sequence), check(due_date>publish_at)
);
create index if not exists task_repeat_due_idx on public.task_repeat_occurrences(publish_at) where status='scheduled';
create table if not exists public.task_notification_outbox (
  notification_id uuid primary key references public.notifications on delete cascade,
  next_attempt_at timestamptz not null default now(), delivered_at timestamptz
);
alter table public.task_repeat_plans enable row level security;
alter table public.task_repeat_occurrences enable row level security;
alter table public.task_notification_outbox enable row level security;
revoke all on public.task_repeat_plans,public.task_repeat_occurrences,public.task_notification_outbox from anon,authenticated;
grant select on public.task_repeat_plans,public.task_repeat_occurrences to authenticated;
grant all on public.task_repeat_plans,public.task_repeat_occurrences,public.task_notification_outbox to service_role;
drop policy if exists repeat_plan_owner on public.task_repeat_plans;
create policy repeat_plan_owner on public.task_repeat_plans for select to authenticated
  using(created_by=auth.uid() or public.current_user_has_permission('can_manage_accounts'));
drop policy if exists repeat_occurrence_owner on public.task_repeat_occurrences;
create policy repeat_occurrence_owner on public.task_repeat_occurrences for select to authenticated
  using(exists(select 1 from public.task_repeat_plans where id=plan_id));

create or replace function public.publish_due_task_plans()
returns integer language plpgsql security definer set search_path=public as $$
declare occurrence record; plan public.task_repeat_plans; new_task uuid; notification uuid; recipient uuid; published integer:=0;
begin
  perform pg_advisory_xact_lock(hashtext('task-repeat-publish'));
  for occurrence in select o.* from public.task_repeat_occurrences o
    where o.status='scheduled' and o.publish_at<=now()
    order by o.publish_at limit 100 for update skip locked
  loop
    select * into plan from public.task_repeat_plans where id=occurrence.plan_id for update;
    if plan.cancelled_at is not null or not exists(select 1 from public.users where id=plan.created_by and is_active)
       or not exists(select 1 from public.teams where id=plan.team_id and not is_archived) then
      update public.task_repeat_occurrences set status='cancelled' where id=occurrence.id;
      continue;
    end if;
    -- Never issue a task whose complete work window elapsed during an outage.
    if occurrence.due_date<=now() then
      update public.task_repeat_occurrences set status='cancelled' where id=occurrence.id;
      continue;
    end if;
    insert into public.tasks(title,description,assigned_to,created_by,team_id,task_scope,due_date,priority,status)
      values(plan.title,plan.description,array(select u.id from public.users u where u.id=any(plan.assigned_to) and u.is_active),
        plan.created_by,plan.team_id,plan.task_scope,occurrence.due_date,plan.priority,'pending') returning id into new_task;
    update public.task_repeat_occurrences set status='published',task_id=new_task where id=occurrence.id;
    for recipient in select unnest(assigned_to) from public.tasks where id=new_task loop
      insert into public.notifications(user_id,type,title,body,dedupe_key)
        values(recipient,'task_assigned','新任务 / New task: '||plan.title,
        '截止 / Due (Malaysia): '||to_char(occurrence.due_date at time zone 'Asia/Kuala_Lumpur','YYYY-MM-DD HH24:MI'),
        'task-assigned-'||new_task||'-'||recipient) returning id into notification;
      insert into public.task_notification_outbox(notification_id) values(notification) on conflict do nothing;
    end loop;
    published:=published+1;
  end loop;
  return published;
end;
$$;
revoke all on function public.publish_due_task_plans() from public,anon,authenticated;
grant execute on function public.publish_due_task_plans() to service_role;

create or replace function public.create_task_repeat_plan(p_team uuid,p_scope text,p_title text,p_description text,p_assigned uuid[],p_priority text,
  p_first timestamptz,p_immediate boolean,p_weekday integer,p_time time,p_count integer)
returns uuid language plpgsql security definer set search_path=public as $$
declare plan_id uuid; first_at timestamptz; publish_local timestamp; due_local timestamp; i integer;
begin
  if not public.current_user_has_permission('can_create_tasks') then raise exception 'TASK_PLAN_ACCESS_DENIED'; end if;
  if not exists(select 1 from public.teams where id=p_team and not is_archived) then raise exception 'TASK_TEAM_INVALID'; end if;
  if nullif(trim(p_title),'') is null or cardinality(p_assigned) is null or cardinality(p_assigned)<1 then raise exception 'TASK_PLAN_FIELDS_REQUIRED'; end if;
  if exists(select 1 from unnest(p_assigned) a(id) left join public.users u on u.id=a.id where u.id is null or not u.is_active
    or (p_scope='executive' and u.role in ('ordinary_member','event_member'))
    or (exists(select 1 from public.teams where id=p_team and type='event') and not exists(select 1 from public.team_members where team_id=p_team and user_id=a.id)))
    then raise exception 'TASK_ROSTER_ASSIGNEE_INVALID'; end if;
  first_at:=case when p_immediate then now() else p_first end;
  if first_at is null or (not p_immediate and first_at<=now()) then raise exception 'FIRST_PUBLICATION_MUST_BE_FUTURE'; end if;
  insert into public.task_repeat_plans(created_by,team_id,task_scope,title,description,assigned_to,priority,first_publish_at,due_weekday,due_time,occurrence_count)
    values(auth.uid(),p_team,p_scope,trim(p_title),p_description,p_assigned,p_priority,first_at,p_weekday,p_time,p_count) returning id into plan_id;
  for i in 0..p_count-1 loop
    publish_local:=(first_at at time zone 'Asia/Kuala_Lumpur')+make_interval(days=>i*7);
    due_local:=publish_local::date+p_time+make_interval(days=>(p_weekday-extract(dow from publish_local)::integer+7)%7);
    if due_local<=publish_local then due_local:=due_local+interval '7 days'; end if;
    insert into public.task_repeat_occurrences(plan_id,sequence,publish_at,due_date)
      values(plan_id,i+1,publish_local at time zone 'Asia/Kuala_Lumpur',due_local at time zone 'Asia/Kuala_Lumpur');
  end loop;
  if p_immediate then perform public.publish_due_task_plans(); end if;
  return plan_id;
end;
$$;
revoke all on function public.create_task_repeat_plan(uuid,text,text,text,uuid[],text,timestamptz,boolean,integer,time,integer) from public,anon;
grant execute on function public.create_task_repeat_plan(uuid,text,text,text,uuid[],text,timestamptz,boolean,integer,time,integer) to authenticated;

create or replace function public.cancel_task_repeat_plan(p_plan uuid)
returns void language plpgsql security definer set search_path=public as $$
declare plan public.task_repeat_plans;
begin
  perform pg_advisory_xact_lock(hashtext('task-repeat-publish'));
  select * into plan from public.task_repeat_plans where id=p_plan for update;
  if plan.id is null or not public.current_user_has_permission('can_create_tasks') or
     (plan.created_by<>auth.uid() and not public.current_user_has_permission('can_manage_accounts')) then raise exception 'TASK_PLAN_ACCESS_DENIED'; end if;
  update public.task_repeat_plans set cancelled_at=now() where id=p_plan;
  update public.task_repeat_occurrences set status='cancelled' where plan_id=p_plan and status='scheduled';
end;
$$;
revoke all on function public.cancel_task_repeat_plan(uuid) from public,anon;
grant execute on function public.cancel_task_repeat_plan(uuid) to authenticated;

create or replace function public.claim_task_notification_outbox()
returns setof public.task_notification_outbox language sql security definer set search_path=public as $$
  update public.task_notification_outbox set next_attempt_at=now()+interval '5 minutes'
  where notification_id in(select notification_id from public.task_notification_outbox where delivered_at is null and next_attempt_at<=now()
    order by next_attempt_at limit 100 for update skip locked) returning *;
$$;
revoke all on function public.claim_task_notification_outbox() from public,anon,authenticated;
grant execute on function public.claim_task_notification_outbox() to service_role;
notify pgrst,'reload schema';
commit;
