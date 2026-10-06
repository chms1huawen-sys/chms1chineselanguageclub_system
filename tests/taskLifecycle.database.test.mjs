import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { boundedRpcSQL } from './rpcInputBoundsFixture.mjs'
import { installMemberWriteLimits } from './memberWriteLimitsFixture.mjs'
const { PGlite }=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
test('scheduled publications, idempotency, cancellation, archival and access boundaries',async()=>{
  const db=new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create table users(id uuid primary key,role text,is_active boolean default true);
      create function current_user_has_permission(text) returns boolean language sql stable security definer as $$select exists(select 1 from users where id=auth.uid() and role='chairperson' and is_active)$$;
      create table teams(id uuid primary key,type text,is_archived boolean default false);
      create table team_members(team_id uuid,user_id uuid);
      create table tasks(id uuid primary key default gen_random_uuid(),team_id uuid,task_scope text default 'members',title text,description text,assigned_to uuid[],created_by uuid,due_date timestamptz,priority text,status text,completed_at timestamptz);
      create table task_comments(id uuid primary key default gen_random_uuid(),task_id uuid,content text);
      create table notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,body text,dedupe_key text unique);
      alter table tasks enable row level security; create policy base on tasks for all to authenticated using(true) with check(true);
      alter table task_comments enable row level security; create policy base on task_comments for all to authenticated using(true) with check(true);
      grant select,update,insert,delete on tasks,task_comments to authenticated;
      insert into users values('10000000-0000-0000-0000-000000000001','chairperson',true),('10000000-0000-0000-0000-000000000002','ordinary_member',true);
      insert into teams values('20000000-0000-0000-0000-000000000001','board',false);
      select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);`)
    const sql=await readFile(new URL('../supabase_migration_2026_10_01_task_lifecycle.sql',import.meta.url),'utf8')
    await db.exec(sql);await db.exec(sql)
    await db.exec(await boundedRpcSQL(['create_task_repeat_plan']))
    await installMemberWriteLimits(db)
    const create=`select create_task_repeat_plan('20000000-0000-0000-0000-000000000001','members','Weekly','Description',array['10000000-0000-0000-0000-000000000002'::uuid],'medium',now()+interval '1 hour',false,4,'20:00',2) as id`
    await db.exec('set role authenticated')
    for (const invalid of [create.replace("'Weekly'", "repeat('x',301)"), create.replace("'Description'", "repeat('x',20001)"), create.replace('false,4', 'null,4'), create.replace("'20:00',2", "'20:00',13")]) {
      await assert.rejects(db.query(invalid), /TASK_PLAN_INPUT_INVALID/)
    }
    const plan=(await db.query(create)).rows[0].id
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int n from tasks')).rows[0].n,0)
    assert.equal((await db.query('select count(*)::int n from notifications')).rows[0].n,0)
    await db.exec(`update task_repeat_occurrences set publish_at=now()-interval '1 minute',due_date=now()+interval '1 day' where sequence=1`)
    assert.equal((await db.query('select publish_due_task_plans() n')).rows[0].n,1)
    assert.equal((await db.query('select publish_due_task_plans() n')).rows[0].n,0)
    assert.equal((await db.query('select count(*)::int n from task_notification_outbox')).rows[0].n,1)
    await db.exec(`set role authenticated; select cancel_task_repeat_plan('${plan}'); reset role;`)
    assert.equal((await db.query("select count(*)::int n from task_repeat_occurrences where status='cancelled'")).rows[0].n,1)
    await db.exec(`insert into tasks(team_id,task_scope,title,assigned_to,status,due_date,completed_at) values
      ('20000000-0000-0000-0000-000000000001','members','Old',array['10000000-0000-0000-0000-000000000002'::uuid],'completed',now()-interval '31 days',now()-interval '32 days');`)
    assert.equal((await db.query('select archive_expired_tasks() n')).rows[0].n,1)
    assert.equal((await db.query('select archive_expired_tasks() n')).rows[0].n,0)
    await db.exec('set role authenticated')
    assert.equal((await db.query("select count(*)::int n from tasks where title='Old'")).rows[0].n,0)
    const records=await db.query("select * from task_performance_records('20000000-0000-0000-0000-000000000001','members')")
    assert.equal(records.rows.length,2)
    assert.ok(records.rows.find(row=>row.title==='Old').archived_at)
    await db.exec("select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false)")
    await assert.rejects(db.query(create),/TASK_PLAN_ACCESS_DENIED/)
    await assert.rejects(db.query("select * from task_performance_records('20000000-0000-0000-0000-000000000001','members')"),/PERFORMANCE_ACCESS_DENIED/)
    assert.equal((await db.query('select count(*)::int n from task_repeat_plans')).rows[0].n,0)
  } finally {await db.close()}
})
