begin;
create or replace function public.finance_report(p_start date, p_end date)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare opening numeric; closing numeric; rows jsonb;
begin
  if not public.finance_access('view') then raise exception 'FINANCE_FORBIDDEN'; end if;
  if p_start is null or p_end is null or p_end<=p_start or p_end>p_start+interval '1 year' then raise exception 'FINANCE_INVALID'; end if;
  select coalesce(sum(amount),0) into opening from public.finance_ledger where entry_date<p_start or (kind='opening' and entry_date>=p_start and entry_date<p_end);
  select coalesce(jsonb_agg(to_jsonb(l) order by l.entry_date,l.created_at,l.id),'[]'::jsonb) into rows from public.finance_ledger l where entry_date>=p_start and entry_date<p_end and kind<>'opening';
  select opening+coalesce(sum(amount),0) into closing from public.finance_ledger where entry_date>=p_start and entry_date<p_end and kind<>'opening';
  return jsonb_build_object('opening',opening,'closing',closing,'entries',rows);
end; $$;
revoke all on function public.finance_report(date,date) from public,anon;
grant execute on function public.finance_report(date,date) to authenticated;
create or replace function public.finance_report_years()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare years jsonb;
begin
  if not public.finance_access('view') then raise exception 'FINANCE_FORBIDDEN'; end if;
  select jsonb_agg(y order by y desc) into years from (
    select distinct extract(year from entry_date)::integer as y from public.finance_ledger
    union select extract(year from now() at time zone 'Asia/Kuala_Lumpur')::integer
  ) available;
  return years;
end; $$;
revoke all on function public.finance_report_years() from public,anon;
grant execute on function public.finance_report_years() to authenticated;
notify pgrst,'reload schema';
commit;
