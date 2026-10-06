begin;

-- Two rolling counters; no IPs, identifiers, or historical rows are stored here.
create table if not exists public.blog_visit_budget (
  kind text primary key check (kind in ('minute','day')),
  bucket timestamptz not null,
  used integer not null check (used >= 0)
);
alter table public.blog_visit_budget enable row level security;
revoke all on public.blog_visit_budget from public, anon, authenticated;

create or replace function public.record_public_blog_visit(
  p_id uuid,p_visitor uuid,p_session uuid,p_path text,p_source text,p_device text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare minute_at timestamptz; day_at timestamptz; minute_used integer; day_used integer; accepted boolean;
begin
  if p_id is null or p_visitor is null or p_session is null or p_path is null
    or length(p_path)>200 or p_device is null or p_device not in ('desktop','mobile','tablet') then
    return jsonb_build_object('accepted',false,'limited',false);
  end if;
  -- Serialize check + write across every server instance, including rotated visitor IDs.
  perform pg_catalog.pg_advisory_xact_lock(1062026, 1);
  minute_at:=pg_catalog.date_trunc('minute',now());
  day_at:=pg_catalog.date_trunc('day',now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur';
  select used into minute_used from public.blog_visit_budget where kind='minute' and bucket=minute_at;
  select used into day_used from public.blog_visit_budget where kind='day' and bucket=day_at;
  if coalesce(minute_used,0)>=600 or coalesce(day_used,0)>=20000 then
    return jsonb_build_object('accepted',false,'limited',true);
  end if;
  accepted:=public.blog_record_visit(p_id,p_visitor,p_session,p_path,p_source,p_device);
  if accepted then
    insert into public.blog_visit_budget(kind,bucket,used) values('minute',minute_at,1),('day',day_at,1)
    on conflict(kind) do update set bucket=excluded.bucket,
      used=case when blog_visit_budget.bucket=excluded.bucket then blog_visit_budget.used+1 else 1 end;
  end if;
  return jsonb_build_object('accepted',accepted,'limited',false);
end;
$$;

revoke all on function public.record_public_blog_visit(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.record_public_blog_visit(uuid,uuid,uuid,text,text,text) to service_role;
revoke all on function public.blog_record_visit(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.blog_record_visit(uuid,uuid,uuid,text,text,text) to service_role;
notify pgrst, 'reload schema';
commit;
