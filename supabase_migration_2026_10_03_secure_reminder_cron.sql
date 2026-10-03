begin;
-- Reuse the existing trusted cron header without printing or copying its secret to a file.
do $$
declare template text; target record; new_command text;
begin
  select command into template from cron.job where jobname='inventory-daily-reminder';
  if template is null or strpos(template, 'x-cron-secret')=0 or strpos(template, '/functions/v1/inventory-reminder')=0 then
    raise exception 'Trusted cron template unavailable; no jobs changed';
  end if;
  for target in select jobid,jobname from cron.job where jobname in ('event-meeting-reminder','task-deadline-reminder') loop
    new_command := replace(template, '/functions/v1/inventory-reminder', '/functions/v1/' || target.jobname);
    perform cron.alter_job(target.jobid, command := new_command);
  end loop;
end;
$$;
commit;
