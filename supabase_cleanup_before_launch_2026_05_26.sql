-- 发布前清理脚本
-- 用途：
-- 1. 删除测试用「第 57 届执委团 (2027/2028)」及其关联任务、日程、成员关系。
-- 2. 清空测试期间产生的通知、动态、任务提醒日志。
-- 3. 删除明显测试账号的 public.users 资料；不会删除正式账号。
--
-- 请在 Supabase Dashboard -> SQL Editor 使用最高权限账号执行。

begin;

-- 先锁定要删除的测试团队。
create temp table cleanup_target_teams as
select id, name, session
from public.teams
where name ilike '%第 57 届执委团%'
   or name ilike '%57届执委团%'
   or name ilike '%2027/2028%'
   or session = '2027/2028';

-- 锁定明显测试账号。正式账号不会因为 inactive 而被删除。
create temp table cleanup_test_users as
select id, name, email
from public.users
where email ilike '%test%'
   or email ilike '%demo%'
   or email ilike '%example%'
   or name ilike '%测试%'
   or name ilike '%test%'
   or name ilike '%demo%';

-- 删除目标团队相关公告。
delete from public.announcements
where target_team_id in (select id from cleanup_target_teams)
   or title ilike '%测试%'
   or body ilike '%测试%'
   or title ilike '%test%'
   or body ilike '%test%'
   or title ilike '%demo%'
   or body ilike '%demo%'
   or title ilike '%第 57 届%'
   or body ilike '%第 57 届%'
   or title ilike '%2027/2028%'
   or body ilike '%2027/2028%';

-- 删除测试请假记录。
delete from public.leave_applications
where user_id in (select id from cleanup_test_users)
   or reason ilike '%测试%'
   or reason ilike '%test%'
   or reason ilike '%demo%'
   or custom_leave_type ilike '%测试%'
   or custom_leave_type ilike '%test%'
   or custom_leave_type ilike '%demo%';

-- 删除测试账号相关任务留言与任务。
delete from public.task_comments
where user_id in (select id from cleanup_test_users)
   or task_id in (
     select id from public.tasks
     where created_by in (select id from cleanup_test_users)
        or assigned_to && array(select id from cleanup_test_users)
   );

delete from public.tasks
where created_by in (select id from cleanup_test_users)
   or assigned_to && array(select id from cleanup_test_users);

delete from public.team_members
where user_id in (select id from cleanup_test_users);

-- 删除测试账号相关通知。
delete from public.notifications
where user_id in (select id from cleanup_test_users)
   or title ilike '%测试%'
   or body ilike '%测试%'
   or title ilike '%test%'
   or body ilike '%test%'
   or title ilike '%demo%'
   or body ilike '%demo%'
   or title ilike '%第 57 届%'
   or body ilike '%第 57 届%'
   or title ilike '%2027/2028%'
   or body ilike '%2027/2028%';

-- 发布前清空测试期间的系统动态与提醒日志。
truncate table public.activity_log;
truncate table public.task_reminder_logs;

-- 删除目标团队本身。team_members、tasks、task_comments、events 会因外键 cascade 一起删除。
delete from public.teams
where id in (select id from cleanup_target_teams);

-- 删除明显测试账号的 public.users 资料。
-- 注意：这只删 public.users；Auth Users 里的测试登录账号请到 Authentication -> Users 手动删除。
delete from public.users
where id in (select id from cleanup_test_users);

commit;

-- 执行后可用以下查询确认清理结果：
select 'teams_57' as check_name, count(*) as remaining
from public.teams
where name ilike '%第 57 届执委团%'
   or name ilike '%57届执委团%'
   or name ilike '%2027/2028%'
   or session = '2027/2028'
union all
select 'test_public_users', count(*)
from public.users
where email ilike '%test%'
   or email ilike '%demo%'
   or email ilike '%example%'
   or name ilike '%测试%'
   or name ilike '%test%'
   or name ilike '%demo%'
union all
select 'activity_log', count(*) from public.activity_log
union all
select 'task_reminder_logs', count(*) from public.task_reminder_logs;
