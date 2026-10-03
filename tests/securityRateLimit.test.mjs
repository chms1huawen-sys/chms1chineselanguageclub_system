import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

test('push rate limit is atomic, bounded per account and unavailable to browser roles', async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
  const db = new PGlite()
  const actor = '10000000-0000-0000-0000-000000000001'
  try {
    await db.exec('create role anon; create role authenticated; create role service_role;')
    const sql = await readFile(new URL('../supabase_migration_2026_10_03_push_rate_limit.sql', import.meta.url),'utf8')
    await db.exec(sql)
    for (let i=1;i<=31;i++) assert.equal((await db.query('select consume_push_rate_limit($1) as allowed',[actor])).rows[0].allowed,i<=30)
    assert.equal((await db.query('select count(*)::int as n from push_request_limits')).rows[0].n,1)
    await db.query("update push_request_limits set window_start=now()-interval '2 minutes'")
    assert.equal((await db.query('select consume_push_rate_limit($1) as allowed',[actor])).rows[0].allowed,true)
    assert.equal((await db.query('select consume_push_rate_limit(null) as allowed')).rows[0].allowed,false)
    await db.exec('set role authenticated')
    await assert.rejects(db.query('select consume_push_rate_limit($1)',[actor]),/permission denied/)
    await assert.rejects(db.query('select * from push_request_limits'),/permission denied/)
  } finally { await db.close() }
})
