-- 清理历年名单残留
-- 用途：
-- 1. 删除测试产生的 2027/2028、第 57 届等历史执委层名单。
-- 2. 删除没有绑定任何成员的 archived board 空名单。
--
-- 在 Supabase Dashboard -> SQL Editor 执行。

begin;

delete from public.teams t
where t.type = 'board'
  and (
    t.name ilike '%第 57 届%'
    or t.name ilike '%57届%'
    or t.name ilike '%2027/2028%'
    or t.session = '2027/2028'
    or (
      t.is_archived = true
      and not exists (
        select 1
        from public.team_members tm
        where tm.team_id = t.id
      )
    )
  );

commit;

-- 检查还有哪些历年名单显示在页面：
select
  t.id,
  t.name,
  t.session,
  t.is_archived,
  count(tm.user_id) as member_count
from public.teams t
left join public.team_members tm on tm.team_id = t.id
where t.type = 'board'
  and t.is_archived = true
group by t.id, t.name, t.session, t.is_archived
order by t.session desc, t.created_at desc;
