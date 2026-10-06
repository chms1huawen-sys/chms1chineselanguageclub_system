begin;

create table if not exists public.member_write_budget (
  actor_id uuid not null,
  scope text not null check(scope in ('tasks','finance','inventory')),
  minute_at timestamptz not null,
  minute_used integer not null check(minute_used>=0),
  hour_at timestamptz not null,
  hour_used integer not null check(hour_used>=0),
  primary key(actor_id,scope)
);
alter table public.member_write_budget enable row level security;
revoke all on public.member_write_budget from public,anon,authenticated;

create or replace function public.enforce_member_write_budget(p_scope text,p_units integer)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); instant timestamptz; minute_now timestamptz; hour_now timestamptz;
  m integer; h integer; wait_seconds integer:=0;
begin
  -- Cron/server writes have no end-user identity. Existing RLS still governs browser writes.
  if actor is null then return; end if;
  if p_scope is null or p_scope not in ('tasks','finance','inventory') or p_units is null or p_units<1 then
    raise exception 'MEMBER_WRITE_INPUT_INVALID';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('member-write:'||actor::text||':'||p_scope,0));
  instant:=pg_catalog.clock_timestamp();
  minute_now:=pg_catalog.date_trunc('minute',instant);
  hour_now:=pg_catalog.date_trunc('hour',instant);
  select case when minute_at=minute_now then minute_used else 0 end,
    case when hour_at=hour_now then hour_used else 0 end into m,h
    from public.member_write_budget where actor_id=actor and scope=p_scope;
  if coalesce(m,0)+p_units>60 then
    wait_seconds:=greatest(1,ceil(extract(epoch from minute_now+interval '1 minute'-instant))::integer);
  end if;
  if coalesce(h,0)+p_units>600 then
    wait_seconds:=greatest(wait_seconds,ceil(extract(epoch from hour_now+interval '1 hour'-instant))::integer);
  end if;
  if wait_seconds>0 then
    raise exception 'MEMBER_WRITE_RATE_LIMIT' using errcode='PT429',
      detail=jsonb_build_object('retry_after',wait_seconds,'scope',p_scope)::text;
  end if;
  insert into public.member_write_budget(actor_id,scope,minute_at,minute_used,hour_at,hour_used)
    values(actor,p_scope,minute_now,coalesce(m,0)+p_units,hour_now,coalesce(h,0)+p_units)
  on conflict(actor_id,scope) do update set minute_at=excluded.minute_at,minute_used=excluded.minute_used,
    hour_at=excluded.hour_at,hour_used=excluded.hour_used;
end;
$$;
revoke all on function public.enforce_member_write_budget(text,integer) from public,anon,authenticated;

create or replace function public.member_write_statement_guard()
returns trigger language plpgsql security definer set search_path='' as $$
declare units integer;
begin
  if auth.uid() is null then return null; end if;
  select count(*)::integer into units from changed_rows;
  if units>0 then perform public.enforce_member_write_budget(TG_ARGV[0],units); end if;
  return null;
end;
$$;
revoke all on function public.member_write_statement_guard() from public,anon,authenticated;

-- Count successful operation records, not RPC retries or notification rows.
drop trigger if exists member_write_insert_limit on public.finance_operations;
create trigger member_write_insert_limit after insert on public.finance_operations
  referencing new table as changed_rows for each statement execute function public.member_write_statement_guard('finance');
drop trigger if exists member_write_insert_limit on public.inventory_operations;
create trigger member_write_insert_limit after insert on public.inventory_operations
  referencing new table as changed_rows for each statement execute function public.member_write_statement_guard('inventory');

do $$
declare target text; scope text;
begin
  for target,scope in select * from (values ('tasks','tasks'),('task_repeat_plans','tasks'),('finance_report_format','finance')) t(target,scope) loop
    execute format('drop trigger if exists member_write_insert_limit on public.%I',target);
    execute format('create trigger member_write_insert_limit after insert on public.%I referencing new table as changed_rows for each statement execute function public.member_write_statement_guard(%L)',target,scope);
    execute format('drop trigger if exists member_write_update_limit on public.%I',target);
    execute format('create trigger member_write_update_limit after update on public.%I referencing new table as changed_rows for each statement execute function public.member_write_statement_guard(%L)',target,scope);
  end loop;
end;
$$;
drop trigger if exists member_write_delete_limit on public.tasks;
create trigger member_write_delete_limit after delete on public.tasks
  referencing old table as changed_rows for each statement execute function public.member_write_statement_guard('tasks');
notify pgrst,'reload schema';
commit;
