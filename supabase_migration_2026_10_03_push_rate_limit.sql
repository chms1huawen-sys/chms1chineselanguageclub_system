begin;
create table if not exists public.push_request_limits (
  actor uuid primary key,
  window_start timestamptz not null,
  requests integer not null check(requests > 0)
);
alter table public.push_request_limits enable row level security;
revoke all on public.push_request_limits from public, anon, authenticated;
grant all on public.push_request_limits to service_role;

create or replace function public.consume_push_rate_limit(p_actor uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare count_requests integer; current_window timestamptz := date_trunc('minute', now());
begin
  if p_actor is null then return false; end if;
  insert into public.push_request_limits(actor,window_start,requests) values(p_actor,current_window,1)
  on conflict(actor) do update set
    requests = case when push_request_limits.window_start = current_window then push_request_limits.requests + 1 else 1 end,
    window_start = current_window
  returning requests into count_requests;
  return count_requests <= 30;
end;
$$;
revoke all on function public.consume_push_rate_limit(uuid) from public, anon, authenticated;
grant execute on function public.consume_push_rate_limit(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
