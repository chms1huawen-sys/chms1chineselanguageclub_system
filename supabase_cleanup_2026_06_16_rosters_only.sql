-- Pre-release cleanup: remove agreed test data and rename the active roster.
-- This intentionally does NOT clear notifications, activity_log, announcements,
-- users, tasks, task_comments, event committees, calendar events, settings,
-- push subscriptions, or task reminder logs.

begin;

-- 1. Remove leave test records.
-- Attachments are deleted first because they belong to leave applications.
do $$
begin
  if to_regclass('public.leave_attachments') is not null then
    delete from public.leave_attachments;
  end if;

  if to_regclass('public.leave_applications') is not null then
    delete from public.leave_applications;
  end if;
end $$;

-- 2. Remove birthday wish test records, if the table exists.
do $$
begin
  if to_regclass('public.birthday_wishes') is not null then
    delete from public.birthday_wishes;
  end if;
end $$;

-- 3. Remove historical roster test data.
-- These are the rows shown in "历年名单".
-- Because team_members.team_id uses ON DELETE CASCADE, archived roster members
-- tied to these archived board teams are removed automatically.
delete from public.teams
where type = 'board'
  and is_archived = true;

-- 4. Rename the currently active executive roster to 2026 second half.
-- This keeps all existing members in the current roster.
update public.teams
set
  name = '一中华文学会 2026 下半年 名单',
  session = '2026-H2',
  end_date = null
where type = 'board'
  and is_archived = false;

notify pgrst, 'reload schema';

commit;
