-- Read-only operational checks. No task execution, push dispatch or data cleanup.
begin transaction read only;

with job_health as (
select j.jobname, j.active, j.schedule, last_run.status as last_status,
       last_run.end_time at time zone 'Asia/Kuala_Lumpur' as last_finished_malaysia
from cron.job j
left join lateral (
  select status, end_time from cron.job_run_details r
  where r.jobid = j.jobid order by r.runid desc limit 1
) last_run on true
where j.jobname in ('event-meeting-reminder', 'inventory-daily-reminder',
                    'push-retry-every-five-minutes', 'task-deadline-reminder', 'task-scheduler')
order by j.jobname
), queue_health as (

select 'late_repeat_publications' as metric, count(*) as value
from public.task_repeat_occurrences
where status = 'scheduled' and publish_at < now() - interval '3 minutes'
union all
select 'late_task_notifications', count(*) from public.task_notification_outbox
where delivered_at is null and next_attempt_at < now() - interval '15 minutes'
union all
select 'late_push_retries', count(*) from public.push_retry_jobs
where status in ('pending', 'processing') and next_attempt_at < now() - interval '15 minutes'
union all
select 'unarchived_expired_tasks', count(*) from public.tasks
where archived_at is null and due_date < now() - interval '30 days 5 minutes'
union all
select 'archive_snapshots_missing', count(*) from public.tasks t
where t.archived_at is not null and not exists (select 1 from public.task_performance_archive a where a.id = t.id)
), photo_health as (

select count(*) as article_photos,
       count(*) filter (where m.display_path is not null) as optimized_photos,
       count(*) filter (where original.name is null) as missing_originals,
       count(*) filter (where m.display_path is not null and preview.name is null) as missing_previews,
       sum((original.metadata->>'size')::bigint) as original_bytes,
       sum((coalesce(preview.metadata, original.metadata)->>'size')::bigint) as display_bytes
from public.blog_media m
left join storage.objects original on original.bucket_id = 'blog-photos' and original.name = m.path
left join storage.objects preview on preview.bucket_id = 'blog-photos' and preview.name = m.display_path
)
select (select json_agg(job_health) from job_health) as jobs,
       (select json_agg(queue_health) from queue_health) as queues,
       (select row_to_json(photo_health) from photo_health) as photos;

commit;
