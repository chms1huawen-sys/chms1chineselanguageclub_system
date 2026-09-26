begin;
create table if not exists public.blog_visits(
id uuid primary key,visitor_id uuid not null,session_id uuid not null,path text not null,
source text not null default '(direct)',device text not null check(device in ('desktop','mobile','tablet')),
visited_at timestamptz not null default now(),minute_bucket timestamptz not null,
unique(session_id,path,minute_bucket)
);
create index if not exists blog_visits_time_idx on public.blog_visits(visited_at);
create index if not exists blog_visits_visitor_time_idx on public.blog_visits(visitor_id,visited_at);
alter table public.blog_visits enable row level security;
revoke all on public.blog_visits from public,anon,authenticated;

-- Only allow known public pages. Store no account IDs, IPs, search terms or full referrer URLs.
create or replace function public.blog_record_visit(p_id uuid,p_visitor uuid,p_session uuid,p_path text,p_source text default '(direct)',p_device text default 'desktop')
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; begin
if p_id is null or p_visitor is null or p_session is null or p_device not in ('desktop','mobile','tablet') then return false; end if;
if public.blog_manager() then return false; end if;
if p_path not in ('/','/activities','/bookroom','/about') then
  if p_path !~ '^/blog/[a-z0-9]+(-[a-z0-9]+)*$' or not exists(select 1 from public.blog_posts where status='published' and '/blog/'||slug=p_path) then return false; end if;
end if;
if length(p_path)>200 or p_path is null then return false; end if;
if p_source is null or (p_source<>'(direct)' and (length(p_source)>253 or p_source !~ '[a-z]' or p_source !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')) then p_source:='(direct)'; end if;
perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_visitor::text)::bigint);
if (select count(*) from public.blog_visits where visitor_id=p_visitor and visited_at>now()-interval '1 minute')>=20 then return false; end if;
insert into public.blog_visits(id,visitor_id,session_id,path,source,device,minute_bucket)
values(p_id,p_visitor,p_session,p_path,p_source,p_device,date_trunc('minute',now())) on conflict do nothing;
get diagnostics n=row_count; return n=1;
end $$;
revoke all on function public.blog_record_visit(uuid,uuid,uuid,text,text,text) from public;
grant execute on function public.blog_record_visit(uuid,uuid,uuid,text,text,text) to anon,authenticated;

-- Report exposes aggregates and page/time history, never persistent visitor identifiers.
create or replace function public.blog_analytics_report(p_start date,p_end date)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s timestamptz; e timestamptz; result jsonb;
begin
if not public.blog_manager() then raise exception 'BLOG_FORBIDDEN'; end if;
if p_start is null or p_end is null or p_end<=p_start or p_end-p_start>366 then raise exception 'BLOG_ANALYTICS_RANGE_INVALID'; end if;
s:=p_start::timestamp at time zone 'Asia/Kuala_Lumpur'; e:=p_end::timestamp at time zone 'Asia/Kuala_Lumpur';
select jsonb_build_object(
'views',count(*),'visitors',count(distinct visitor_id),'sessions',count(distinct session_id),
'daily',coalesce((select jsonb_agg(to_jsonb(d) order by d.date) from (select (visited_at at time zone 'Asia/Kuala_Lumpur')::date as date,count(*) as views,count(distinct visitor_id) as visitors from public.blog_visits where visited_at>=s and visited_at<e group by 1) d),'[]'::jsonb),
'pages',coalesce((select jsonb_agg(to_jsonb(p)) from (select path,count(*) as views,count(distinct visitor_id) as visitors from public.blog_visits where visited_at>=s and visited_at<e group by path order by views desc,path limit 100) p),'[]'::jsonb),
'sources',coalesce((select jsonb_agg(to_jsonb(r)) from (select source,count(*) as views from public.blog_visits where visited_at>=s and visited_at<e group by source order by views desc limit 30) r),'[]'::jsonb),
'recent',coalesce((select jsonb_agg(to_jsonb(v)) from (select visited_at,path,source,device from public.blog_visits where visited_at>=s and visited_at<e order by visited_at desc limit 100) v),'[]'::jsonb)
) into result from public.blog_visits where visited_at>=s and visited_at<e;
return result;
end $$;
revoke all on function public.blog_analytics_report(date,date) from public,anon;
grant execute on function public.blog_analytics_report(date,date) to authenticated;
notify pgrst,'reload schema';
commit;
