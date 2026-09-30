import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
test('retry jobs are private, bounded, leased and do not re-claim sent jobs', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table notifications(id uuid primary key);
      create table push_subscriptions(id uuid primary key);
      insert into notifications values ('00000000-0000-0000-0000-000000000001');
      insert into push_subscriptions values ('00000000-0000-0000-0000-000000000002');`)
    const sql = await readFile(new URL('../supabase_migration_2026_09_30_push_retry.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    await db.exec(`insert into push_retry_jobs(notification_id,subscription_id,next_attempt_at)
      values ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',now()-interval '1 minute')`)
    const jobs = await db.query('select * from claim_push_retry_jobs()')
    assert.equal(jobs.rows.length, 1)
    assert.equal(jobs.rows[0].attempts, 1)
    assert.equal((await db.query('select * from claim_push_retry_jobs()')).rows.length, 0)
    await db.exec("update push_retry_jobs set status='sent',next_attempt_at=now()-interval '1 minute'")
    assert.equal((await db.query('select * from claim_push_retry_jobs()')).rows.length, 0)
    await db.exec("update push_retry_jobs set status='pending',attempts=5")
    assert.equal((await db.query('select * from claim_push_retry_jobs()')).rows.length, 0)
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select * from push_retry_jobs'), /permission denied/)
    await assert.rejects(db.query('select * from claim_push_retry_jobs()'), /permission denied/)
  } finally { await db.close() }
})
