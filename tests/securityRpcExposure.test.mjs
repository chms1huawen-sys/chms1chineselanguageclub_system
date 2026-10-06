import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('member count denies anonymous and inactive accounts; trigger revokes preserve normal writes', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create function auth.role() returns text language sql as $$select current_setting('test.role',true)$$;
      grant usage on schema auth to authenticated, service_role;
      create table public.users(id uuid primary key, is_active boolean);
      insert into public.users values ('10000000-0000-0000-0000-000000000001',true),('10000000-0000-0000-0000-000000000002',false);
      create function public.active_member() returns boolean language sql security definer set search_path=public as $$select exists(select 1 from users where id=auth.uid() and is_active)$$;
      create function public.capture_notification_push_actor() returns trigger language plpgsql security definer set search_path=public as $$begin new.value := new.value + 1; return new; end$$;
      create function public.finance_permission_guard() returns trigger language plpgsql security definer set search_path=public as $$begin return new; end$$;
      create function public.validate_task_roster_scope() returns trigger language plpgsql security definer set search_path=public as $$begin return new; end$$;
      create table public.fixture(value integer);
      create trigger fixture_guard before insert on public.fixture for each row execute function public.capture_notification_push_actor();
      grant insert,select on public.fixture to authenticated;
    `)
    await db.exec(await readFile(new URL('../supabase_active_member_count_rpc_2026_05_27.sql', import.meta.url), 'utf8'))
    assert.equal((await db.query("select has_function_privilege('anon','public.get_active_member_count()','EXECUTE') as allowed")).rows[0].allowed, true)
    await db.exec(await readFile(new URL('../supabase_migration_2026_10_06_rpc_exposure.sql', import.meta.url), 'utf8'))
    await db.exec('set role anon')
    await assert.rejects(db.query('select public.get_active_member_count()'), /permission denied/)
    await db.exec('reset role; set role authenticated')
    await db.exec("set test.uid='10000000-0000-0000-0000-000000000002'; set test.role='authenticated'")
    await assert.rejects(db.query('select public.get_active_member_count()'), /MEMBER_ACCESS_FORBIDDEN/)
    await db.exec("set test.uid='10000000-0000-0000-0000-000000000001'")
    assert.equal((await db.query('select public.get_active_member_count() as count')).rows[0].count, 1)
    await db.exec('insert into public.fixture values (1)')
    assert.equal((await db.query('select value from public.fixture')).rows[0].value, 2)
    for (const name of ['capture_notification_push_actor','finance_permission_guard','validate_task_roster_scope']) {
      assert.equal((await db.query("select has_function_privilege('authenticated',$1,'EXECUTE') as allowed", [`public.${name}()`])).rows[0].allowed, false)
    }
    await db.exec("reset role; set role service_role; set test.role='service_role'; set test.uid=''")
    assert.equal((await db.query('select public.get_active_member_count() as count')).rows[0].count, 1)
  } finally { await db.close() }
})
