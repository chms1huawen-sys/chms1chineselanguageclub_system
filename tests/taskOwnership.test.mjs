import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canModifyTask } from '../src/utils/taskOwnership.js'
import { PGlite } from '@electric-sql/pglite'

test('only original publisher can edit or delete, regardless of recipient role', () => {
  const task = { created_by: 'publisher', assigned_to: ['recipient'] }
  assert.equal(canModifyTask(task, { id: 'publisher' }), true)
  for (const role of ['ordinary_member', 'chairperson', 'advisor_teacher']) {
    assert.equal(canModifyTask(task, { id: 'recipient', role, permissions: { can_create_tasks: true } }), false)
  }
  assert.equal(canModifyTask({}, {}), false)
  assert.equal(canModifyTask(null, { id: 'publisher' }), false)
})

test('database denies non-owner detail edits and deletion while preserving progress', async () => {
  const db = new PGlite()
  const owner = '10000000-0000-0000-0000-000000000001'
  const manager = '10000000-0000-0000-0000-000000000002'
  const recipient = '10000000-0000-0000-0000-000000000003'
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
      create function active_member() returns boolean language sql as $$ select auth.uid() is not null $$;
      create function current_user_has_permission(text) returns boolean language sql as $$ select auth.uid()='${manager}'::uuid $$;
      create function can_manage_committee(uuid) returns boolean language sql as $$ select auth.uid()='${manager}'::uuid $$;
      create table tasks(id int,created_by uuid,team_id uuid,assigned_to uuid[],title text,description text,due_date timestamptz,status text,completed_at timestamptz,updated_at timestamptz);
      alter table tasks enable row level security;
      create policy legacy_broad_access on tasks for all to authenticated using(true) with check(true);
      grant select,update,delete on tasks to authenticated; grant usage on schema auth to authenticated;
      insert into tasks(id,created_by,assigned_to,title,status) values(1,'${owner}',array['${recipient}'::uuid],'Original','pending');`)
    await db.exec(await readFile(new URL('../supabase_migration_2026_10_03_task_update_guard.sql', import.meta.url), 'utf8'))
    const migration = await readFile(new URL('../supabase_migration_2026_10_04_task_owner_permissions.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await db.exec(migration)
    await db.query("select set_config('request.jwt.claim.role','authenticated',false)")
    for (const user of [recipient, manager]) {
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user])
      await db.exec('set role authenticated')
      for (const mutation of ["title='Forged'", "description='Forged'", "due_date=now()", `created_by='${user}'`]) {
        await assert.rejects(db.query(`update tasks set ${mutation} where id=1`), /TASK_UPDATE_FORBIDDEN/)
      }
      const deleted = await db.query('delete from tasks where id=1 returning id')
      assert.equal(deleted.rows.length, 0)
      await db.query("update tasks set status='completed',completed_at='2000-01-01' where id=1")
      assert.ok(new Date((await db.query('select completed_at from tasks')).rows[0].completed_at).getUTCFullYear() > 2020)
      await db.exec('reset role')
    }
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner])
    await db.exec('set role authenticated')
    await db.query("update tasks set title='Publisher edit' where id=1")
    await assert.rejects(db.query(`update tasks set created_by='${manager}' where id=1`), /TASK_UPDATE_FORBIDDEN/)
    assert.equal((await db.query('delete from tasks where id=1 returning id')).rows.length, 1)
  } finally { await db.close() }
})
