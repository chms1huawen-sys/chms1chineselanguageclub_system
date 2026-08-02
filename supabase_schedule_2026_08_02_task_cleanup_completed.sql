-- Schedule completed task cleanup to run once per day.
-- Run this in Supabase SQL Editor after deploying task-cleanup-completed.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('task-cleanup-completed-daily')
where exists (
  select 1
  from cron.job
  where jobname = 'task-cleanup-completed-daily'
);

select cron.schedule(
  'task-cleanup-completed-daily',
  '15 16 * * *',
  $$
  select net.http_post(
    url := 'https://xvzxewqeadppzsbczfak.supabase.co/functions/v1/task-cleanup-completed',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
