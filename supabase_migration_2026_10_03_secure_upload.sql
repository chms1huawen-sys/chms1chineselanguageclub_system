begin;
create or replace function public.can_upload_validated_file(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path=public as $$
  select public.active_member() and length(p_path) between 1 and 500 and
    case p_bucket
      when 'avatars' then split_part(p_path,'/',1)=auth.uid()::text
      when 'finance-receipts' then public.finance_access('active') and split_part(p_path,'/',1)=auth.uid()::text
      when 'inventory-photos' then public.inventory_access('manage')
      when 'blog-photos' then public.blog_asset_editable(p_path)
      when 'blog-site-media' then public.blog_manager()
      else false end;
$$;
revoke all on function public.can_upload_validated_file(text,text) from public,anon;
grant execute on function public.can_upload_validated_file(text,text) to authenticated;

create table if not exists public.upload_request_limits(actor uuid primary key,window_start timestamptz not null,requests integer not null check(requests>0));
alter table public.upload_request_limits enable row level security;
revoke all on public.upload_request_limits from public,anon,authenticated;
grant all on public.upload_request_limits to service_role;
create or replace function public.consume_upload_rate_limit(p_actor uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare n integer; current_window timestamptz:=date_trunc('minute',now());
begin
  if p_actor is null then return false; end if;
  insert into public.upload_request_limits values(p_actor,current_window,1)
  on conflict(actor) do update set requests=case when upload_request_limits.window_start=current_window then upload_request_limits.requests+1 else 1 end,window_start=current_window
  returning requests into n;
  return n<=120;
end;
$$;
revoke all on function public.consume_upload_rate_limit(uuid) from public,anon,authenticated;
grant execute on function public.consume_upload_rate_limit(uuid) to service_role;
notify pgrst,'reload schema';
commit;
