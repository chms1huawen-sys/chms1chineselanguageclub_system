import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

test('assignees can update progress but cannot change ownership, deadlines or performance timestamps', async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
  const db = new PGlite()
  const manager='10000000-0000-0000-0000-000000000001', member='10000000-0000-0000-0000-000000000002'
  try {
    await db.exec(`create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
      create role anon;
      create function active_member() returns boolean language sql as $$ select auth.uid() is not null $$;
      create function current_user_has_permission(text) returns boolean language sql as $$ select auth.uid()='${manager}'::uuid $$;
      create function can_manage_committee(uuid) returns boolean language sql as $$ select false $$;
      create table tasks(id int,created_by uuid,team_id uuid,assigned_to uuid[],title text,due_date timestamptz,status text,completed_at timestamptz,updated_at timestamptz);
      grant select,update on tasks to authenticated;
      grant usage on schema auth to authenticated;
      insert into tasks(id,created_by,assigned_to,title,status) values(1,'${manager}',array['${member}'::uuid],'Original','pending');`)
    await db.exec(await readFile(new URL('../supabase_migration_2026_10_03_task_update_guard.sql',import.meta.url),'utf8'))
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[member])
    await db.query("select set_config('request.jwt.claim.role','authenticated',false)")
    await db.exec('set role authenticated')
    await db.query("update tasks set status='completed',completed_at='2000-01-01' where id=1")
    const completed = (await db.query('select completed_at from tasks')).rows[0].completed_at
    assert.ok(new Date(completed).getUTCFullYear()>2020)
    await assert.rejects(db.query("update tasks set title='Forged' where id=1"),/TASK_UPDATE_FORBIDDEN/)
    await assert.rejects(db.query("update tasks set due_date=now()+interval '1 year' where id=1"),/TASK_UPDATE_FORBIDDEN/)
    await db.query("update tasks set completed_at='2000-01-01' where id=1")
    assert.equal(String((await db.query('select completed_at from tasks')).rows[0].completed_at),String(completed))
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[manager])
    await db.exec('set role authenticated')
    await db.query("update tasks set title='Manager edit' where id=1")
    assert.equal((await db.query('select title from tasks')).rows[0].title,'Manager edit')
  } finally {await db.close()}
})
