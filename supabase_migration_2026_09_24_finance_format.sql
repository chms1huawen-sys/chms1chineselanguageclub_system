begin;
-- Income entry does not grant the president treasury review/payment permissions.
create or replace function public.finance_can_record_income()
returns boolean language sql stable security definer set search_path=public as $$
  select public.finance_access('treasury') or exists(select 1 from public.users where id=auth.uid() and is_active and role='chairperson');
$$;
create or replace function public.finance_record_income(p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare op uuid:=(p_data->>'operation_id')::uuid; result jsonb; target uuid; actor_name text; day date:=(p_data->>'entry_date')::date;
begin
  if not public.finance_can_record_income() or op is null then raise exception 'FINANCE_FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtextextended(op::text,0));
  select o.result into result from public.finance_operations o where o.id=op and o.actor_id=auth.uid();
  if found then return result; end if;
  if day is null or day>(now() at time zone 'Asia/Kuala_Lumpur')::date then raise exception 'FINANCE_DATE_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('finance-ledger',0));
  if exists(select 1 from public.finance_ledger where kind='opening' and entry_date>day) then raise exception 'FINANCE_BEFORE_OPENING'; end if;
  select name into actor_name from public.users where id=auth.uid();
  insert into public.finance_ledger(entry_date,kind,description,amount,actor_id,actor_name)
  values(day,'income',p_data->>'description',(p_data->>'amount')::numeric,auth.uid(),actor_name) returning id into target;
  result:=jsonb_build_object('id',target,'notification_ids','[]'::jsonb);
  insert into public.finance_operations values(op,auth.uid(),result);
  return result;
end; $$;
revoke all on function public.finance_record_income(jsonb) from public,anon;
grant execute on function public.finance_record_income(jsonb) to authenticated;

create table if not exists public.finance_report_format (
  lang text primary key check(lang in ('zh','en')),
  title text not null check(length(trim(title)) between 1 and 120),
  category text not null check(length(trim(category)) between 1 and 30),
  item text not null check(length(trim(item)) between 1 and 30),
  total text not null check(length(trim(total)) between 1 and 30),
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.finance_report_format(lang,title,category,item,total) values
  ('zh','一中华文学会 · 收支账目','类别','项目','合计'),
  ('en','CLC_sys · Financial Statement','Type','Description','Total') on conflict(lang) do nothing;
alter table public.finance_report_format enable row level security;
revoke all on public.finance_report_format from anon,authenticated;
grant select on public.finance_report_format to authenticated;
drop policy if exists finance_format_read on public.finance_report_format;
create policy finance_format_read on public.finance_report_format for select to authenticated using(public.finance_access('view'));
create or replace function public.finance_save_format(p_lang text,p_title text,p_category text,p_item text,p_total text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.finance_can_record_income() then raise exception 'FINANCE_FORBIDDEN'; end if;
  insert into public.finance_report_format(lang,title,category,item,total,updated_by)
  values(p_lang,trim(p_title),trim(p_category),trim(p_item),trim(p_total),auth.uid())
  on conflict(lang) do update set title=excluded.title,category=excluded.category,item=excluded.item,total=excluded.total,updated_by=excluded.updated_by,updated_at=now();
end; $$;
revoke all on function public.finance_save_format(text,text,text,text,text) from public,anon;
grant execute on function public.finance_save_format(text,text,text,text,text) to authenticated;
do $$ begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='finance_report_format') then
    alter publication supabase_realtime add table public.finance_report_format;
  end if;
end $$;
notify pgrst,'reload schema';
commit;
