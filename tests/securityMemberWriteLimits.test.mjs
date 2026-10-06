import test from 'node:test'
import assert from 'node:assert/strict'
import { installMemberWriteLimits } from './memberWriteLimitsFixture.mjs'
import { memberWriteError } from '../src/utils/memberWriteError.js'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')

test('account write quotas are atomic, module-scoped, rollback-safe and exclude server jobs', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);`)
    await installMemberWriteLimits(db)
    await installMemberWriteLimits(db)
    await db.exec('grant select,insert,update,delete on tasks,task_repeat_plans,finance_operations,inventory_operations,finance_report_format to authenticated')
    await db.exec('set role authenticated')
    await assert.rejects(db.query("select enforce_member_write_budget('tasks',1)"), /permission denied/)
    await assert.rejects(db.query('select * from member_write_budget'), /permission denied/)
    await db.exec('insert into tasks select gen_random_uuid() from generate_series(1,60)')
    await assert.rejects(db.query('insert into tasks default values'), /MEMBER_WRITE_RATE_LIMIT/)
    assert.equal((await db.query('select count(*)::int n from tasks')).rows[0].n, 60)
    await db.exec('insert into finance_operations default values; insert into inventory_operations default values')
    // Retrying an existing operation does not create another operation record or consume quota.
    const existing = (await db.query('select id from finance_operations limit 1')).rows[0].id
    await db.query('insert into finance_operations(id) values($1) on conflict do nothing', [existing])
    await db.exec("select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',false)")
    await db.exec('insert into tasks default values')
    await db.exec('reset role')
    assert.equal((await db.query("select minute_used from member_write_budget where scope='finance'")).rows[0].minute_used, 1)
    await db.exec("select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false); update member_write_budget set minute_at=now()-interval '2 minutes' where scope='tasks'; set role authenticated")
    await db.exec('insert into tasks default values')
    await db.exec("reset role; update member_write_budget set hour_used=600 where scope='tasks'; set role authenticated")
    await assert.rejects(db.query('update tasks set id=id'), /MEMBER_WRITE_RATE_LIMIT/)
    await db.exec("reset role; select set_config('request.jwt.claim.sub','',false)")
    await db.exec('insert into tasks select gen_random_uuid() from generate_series(1,100)')
    assert.equal((await db.query('select count(*)::int n from tasks')).rows[0].n, 162)
    await db.exec("select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',false); set role authenticated")
    await assert.rejects(db.query('insert into tasks select gen_random_uuid() from generate_series(1,61)'), /MEMBER_WRITE_RATE_LIMIT/)
    await db.exec('reset role')
    assert.equal((await db.query("select count(*)::int n from member_write_budget where actor_id='10000000-0000-0000-0000-000000000003'")).rows[0].n, 0)
  } finally { await db.close() }
})

test('quota errors explain retry time and unsaved changes without changing other errors', () => {
  const error = { code: 'PT429', message: 'MEMBER_WRITE_RATE_LIMIT', details: '{"retry_after":123}' }
  assert.match(memberWriteError(error), /123 秒.*未保存/)
  assert.match(memberWriteError(error, 'en'), /123 seconds/)
  assert.match(memberWriteError({ ...error, details: '{}' }), /60 秒/)
  assert.equal(memberWriteError({ message: 'FINANCE_FORBIDDEN' }), null)
})
