-- Run after deploying task-scheduler. Reuse the existing authenticated push-retry request,
-- without copying a cron secret into source control or exposing it in query results.
do $$
declare command_text text; job record;
begin
  select command into command_text from cron.job
    where command like '%/push-retry%' and command like '%net.http_post%' order by jobid limit 1;
  if command_text is null or command_text not like '%x-cron-secret%' then raise exception 'Authenticated push-retry cron not found. Configure task-scheduler manually.'; end if;
  for job in select jobid from cron.job where jobname='task-scheduler' loop perform cron.unschedule(job.jobid); end loop;
  perform cron.schedule('task-scheduler','* * * * *',replace(command_text,'/push-retry','/task-scheduler'));
  -- The old delete endpoint is superseded by the non-destructive lifecycle worker.
  for job in select jobid from cron.job where command like '%/task-cleanup-completed%' loop perform cron.unschedule(job.jobid); end loop;
end;
$$;
