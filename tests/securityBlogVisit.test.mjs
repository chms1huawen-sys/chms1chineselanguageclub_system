import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { createVisitHandler } from '../supabase/functions/blog-visit/handler.js'
import { boundedRpcSQL } from './rpcInputBoundsFixture.mjs'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const payload = () => ({ p_id: randomUUID(), p_visitor: randomUUID(), p_session: randomUUID(), p_path: '/', p_source: '(direct)', p_device: 'mobile' })

test('visit gateway validates before database access and preserves manager exclusion', async () => {
  const calls = []
  let limited = false, manager = false, failed = false
  const handler = createVisitHandler({ env: key => ({ SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', SERVICE_ROLE_KEY: 'server' })[key],
    createClient: (_url, key) => ({ rpc: async (name, data) => {
      calls.push({ key, name, data })
      return name === 'blog_manager' ? { data: manager } : { data: { accepted: true, limited }, error: failed ? new Error('secret detail') : null }
    } }),
  })
  const request = (body, overrides = {}) => new Request('https://example.test', { method: 'POST', headers: { authorization: 'Bearer anon', origin: 'https://chms1chineselanguageclubsystem.vercel.app', 'content-type': 'application/json', ...overrides }, body: JSON.stringify(body) })
  for (const body of [[], { ...payload(), p_path: '/member' }, { ...payload(), p_source: 'https://example.test/?email=secret' }, { ...payload(), p_device: null }]) assert.equal((await handler(request(body))).status, 400)
  assert.equal((await handler(request({ ...payload(), extra: 'x'.repeat(3000) }))).status, 413)
  assert.equal((await handler(request(payload(), { origin: 'https://attacker.test' }))).status, 403)
  assert.equal(calls.length, 0)
  assert.equal((await handler(request(payload()))).status, 200)
  assert.equal(calls.at(-1).key, 'server')
  assert.equal(calls.at(-1).name, 'record_public_blog_visit')
  limited = true
  const response = await handler(request(payload()))
  assert.equal(response.status, 429)
  assert.equal(response.headers.get('retry-after'), '60')
  failed = true
  assert.equal((await handler(request(payload()))).status, 503)
  manager = true
  const before = calls.length
  assert.deepEqual(await (await handler(request(payload()))).json(), { accepted: false })
  assert.equal(calls.length, before + 1)
})

test('server-only statistics budget cannot be bypassed by rotating visitor IDs', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create function blog_manager() returns boolean language sql as $$select false$$;
      create table blog_posts(status text,slug text);`)
    await db.exec(await readFile(new URL('../supabase_migration_2026_09_25_blog_analytics.sql', import.meta.url), 'utf8'))
    await db.exec(await boundedRpcSQL(['blog_record_visit']))
    const migration = await readFile(new URL('../supabase_migration_2026_10_06_blog_visit_gateway.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    const args = () => Object.values(payload())
    const record = values => db.query('select record_public_blog_visit($1,$2,$3,$4,$5,$6) as result', values || args())
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(record(), /permission denied/)
      await assert.rejects(db.query('select blog_record_visit($1,$2,$3,$4,$5,$6)', args()), /permission denied/)
      await assert.rejects(db.query('select * from blog_visit_budget'), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    const same = args()
    assert.equal((await record(same)).rows[0].result.accepted, true)
    assert.equal((await record(same)).rows[0].result.accepted, false)
    await db.exec('reset role')
    assert.equal((await db.query("select used from blog_visit_budget where kind='minute'")).rows[0].used, 1)
    await db.exec("update blog_visit_budget set used=599 where kind='minute'; set role service_role")
    assert.equal((await record()).rows[0].result.accepted, true)
    assert.equal((await record()).rows[0].result.limited, true)
    await db.exec("reset role; update blog_visit_budget set bucket=now()-interval '2 minutes' where kind='minute'; set role service_role")
    assert.equal((await record()).rows[0].result.accepted, true)
    await db.exec("reset role; update blog_visit_budget set used=20000 where kind='day'; set role service_role")
    assert.equal((await record()).rows[0].result.limited, true)
    await db.exec("reset role; update blog_visit_budget set bucket=now()-interval '2 days' where kind='day'; set role service_role")
    assert.equal((await record()).rows[0].result.accepted, true)
    await db.exec('reset role')
    assert.equal((await db.query('select count(*)::int n from blog_visit_budget')).rows[0].n, 2)
    assert.equal((await db.query('select count(*)::int n from blog_visits')).rows[0].n, 4)
  } finally { await db.close() }
})
