begin;
create table if not exists public.push_retry_jobs (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  target_url text not null default '/#/',
  attempts integer not null default 0,
  status text not null default 'pending' check (status in ('pending','processing','sent','failed','cancelled')),
  next_attempt_at timestamptz not null default now() + interval '5 minutes',
  updated_at timestamptz not null default now(),
  primary key (notification_id, subscription_id)
);
alter table public.push_retry_jobs enable row level security;
revoke all on public.push_retry_jobs from anon, authenticated;
grant all on public.push_retry_jobs to service_role;

create or replace function public.claim_push_retry_jobs()
returns setof public.push_retry_jobs language sql security definer set search_path = public as $$
  update public.push_retry_jobs j
  set status = 'processing', attempts = j.attempts + 1,
      next_attempt_at = now() + interval '15 minutes', updated_at = now()
  where (j.notification_id,j.subscription_id) in (
    select q.notification_id,q.subscription_id from public.push_retry_jobs q
    where q.status in ('pending','processing') and q.attempts < 5 and q.next_attempt_at <= now()
    order by q.next_attempt_at limit 5 for update skip locked
  ) returning j.*;
$$;
revoke all on function public.claim_push_retry_jobs() from public, anon, authenticated;
grant execute on function public.claim_push_retry_jobs() to service_role;
commit;
