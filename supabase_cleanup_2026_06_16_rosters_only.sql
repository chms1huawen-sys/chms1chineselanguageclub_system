-- Clean only archived executive roster test data and rename the active roster.
-- This intentionally does NOT clear notifications, activity_log, announcements,
-- users, tasks, task_comments, event committees, calendar events, settings, or push subscriptions.

begin;

-- 1. Remove historical roster test data.
-- These are the rows shown in "历年名单".
-- Because team_members.team_id uses ON DELETE CASCADE, archived roster members
-- tied to these archived board teams are removed automatically.
delete from public.teams
where type = 'board'
  and is_archived = true;

-- 2. Rename the currently active executive roster to 2026 second half.
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
