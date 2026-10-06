import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('internal helpers deny anonymous and inactive committee members without losing valid access', async () => {
  const db = new PGlite()
  const member = '10000000-0000-0000-0000-000000000001'
  const team = '20000000-0000-0000-0000-000000000001'
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      grant usage on schema auth to authenticated;
      create table users(id uuid primary key, role text, is_active boolean);
      create table teams(id uuid primary key, type text);
      create table team_members(team_id uuid,user_id uuid,position text);
      create function active_member() returns boolean language sql security definer set search_path=public as $$select exists(select 1 from users where id=auth.uid() and is_active)$$;
      create function finance_access(text,uuid) returns boolean language sql as $$select false$$;
      create function finance_can_record_income() returns boolean language sql as $$select false$$;
    `)
    await db.query("insert into users values($1,'ordinary_member',true)", [member])
    await db.query("insert into teams values($1,'event')", [team])
    await db.query("insert into team_members values($1,$2,'筹委主席')", [team, member])
    const migration = await readFile(new URL('../supabase_migration_2026_10_06_internal_permission_helpers.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    for (const signature of ['can_manage_committee(uuid)', 'can_view_committee(uuid)', 'finance_access(text,uuid)', 'finance_can_record_income()']) {
      assert.equal((await db.query("select has_function_privilege('anon',$1,'EXECUTE') as allowed", [signature])).rows[0].allowed, false)
    }
    await db.query("select set_config('test.uid',$1,false)", [member])
    await db.exec('set role authenticated')
    const access = async () => (await db.query('select can_manage_committee($1) as manage,can_view_committee($1) as view', [team])).rows[0]
    assert.deepEqual(await access(), { manage: true, view: true })
    assert.deepEqual((await db.query('select can_manage_committee($1) as manage,can_view_committee($1) as view', ['30000000-0000-0000-0000-000000000001'])).rows[0], { manage: false, view: false })
    await db.exec('reset role')
    await db.query('update users set is_active=false where id=$1', [member])
    await db.exec('set role authenticated')
    assert.deepEqual(await access(), { manage: false, view: false })
    await db.exec('reset role')
    await db.query("update users set is_active=true,role='advisor_teacher' where id=$1", [member])
    await db.exec('set role authenticated')
    assert.equal((await db.query('select can_manage_committee($1) as allowed', ['30000000-0000-0000-0000-000000000001'])).rows[0].allowed, true)
  } finally { await db.close() }
})
