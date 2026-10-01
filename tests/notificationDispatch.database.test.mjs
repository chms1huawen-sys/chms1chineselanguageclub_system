import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')

test('notification provenance survives updates and raw client creation is revoked', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table notifications(id uuid primary key, type text);
      grant insert,update,select on notifications to authenticated;
      create function create_notification_for_user(uuid,text,text,text,text) returns void language sql security definer as $$select$$;
      grant execute on function create_notification_for_user(uuid,text,text,text,text) to authenticated;`)
    const sql = await readFile(new URL('../supabase_migration_2026_10_01_notification_dispatch_scope.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const actor = '10000000-0000-0000-0000-000000000001'
    await db.exec(`select set_config('request.jwt.claim.sub','${actor}',false);
      insert into notifications(id,type,push_actor_id) values('${actor}','inventory','10000000-0000-0000-0000-000000000002');
      update notifications set push_actor_id=null;`)
    assert.equal((await db.query('select push_actor_id from notifications')).rows[0].push_actor_id, actor)
    assert.equal((await db.query("select has_table_privilege('authenticated','notifications','insert') as allowed")).rows[0].allowed, false)
    assert.equal((await db.query("select has_function_privilege('authenticated','create_notification_for_user(uuid,text,text,text,text)','execute') as allowed")).rows[0].allowed, false)
    assert.equal((await db.query("select has_table_privilege('authenticated','notifications','update') as allowed")).rows[0].allowed, true)
    await db.exec(`create function trusted_inventory_notification() returns void language sql security definer set search_path=public as $$
      insert into notifications(id,type) values('20000000-0000-0000-0000-000000000001','inventory')
    $$;
    grant usage on schema auth to authenticated;
    set role authenticated;
    select trusted_inventory_notification();
    reset role;`)
    assert.equal((await db.query("select push_actor_id from notifications where id='20000000-0000-0000-0000-000000000001'")).rows[0].push_actor_id, actor)
  } finally { await db.close() }
})
