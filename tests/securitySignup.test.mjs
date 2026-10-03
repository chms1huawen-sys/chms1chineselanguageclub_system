import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'

test('signup cannot choose privileges; inactive sessions cannot read private data; notification RPCs still work', async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
  const db = new PGlite()
  const manager = '10000000-0000-0000-0000-000000000001'
  const member = '10000000-0000-0000-0000-000000000002'
  const signup = '10000000-0000-0000-0000-000000000003'
  const tables = ['activity_log','announcements','events','finance_claims','finance_ledger','finance_operations','finance_receipts','finance_report_format','finance_reviews','inventory_categories','inventory_items','inventory_movements','inventory_operations','inventory_request_lines','inventory_requests','leave_applications','push_retry_jobs','push_subscriptions','system_settings','task_comments','task_notification_outbox','task_performance_archive','task_reminder_logs','task_repeat_occurrences','task_repeat_plans','tasks','team_members','teams']
  async function as(role, id = '') {
    await db.query('reset role')
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
    await db.exec(`set role ${role}`)
  }
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      create table public.users(id uuid primary key,name text,email text,custom_role_label text,role text,is_active boolean);
      alter table users enable row level security;
      grant select, update on users to authenticated;
      grant select on users to anon;
      create policy "Users are viewable by all authenticated users." on users for select to authenticated using(true);
      create function account_manager() returns boolean language sql stable security definer as $$ select exists(select 1 from users where id=auth.uid() and role='chairperson' and is_active) $$;
      create policy manager_update on users for update to authenticated using(account_manager()) with check(account_manager());
      insert into users(id,role,is_active) values('${manager}','chairperson',true),('${member}','ordinary_member',true);
      create table notifications(id uuid primary key default gen_random_uuid(),user_id uuid,title text,body text,read_at timestamptz);
      alter table notifications enable row level security;
      grant all on notifications to anon, authenticated;
      create policy notification_read on notifications for select to authenticated using(user_id=auth.uid());
      create policy notification_update on notifications for update to authenticated using(user_id=auth.uid());
      create function fake_rpc_notify(target uuid) returns uuid language plpgsql security definer as $$ declare result uuid; begin insert into notifications(user_id,title) values(target,'Trusted RPC') returning id into result; return result; end $$;
      create table auth.signup_fixture(id uuid, email text, raw_user_meta_data jsonb);
      create schema storage; grant usage on schema storage to authenticated;
      create table storage.objects(bucket_id text,name text); alter table storage.objects enable row level security;
      grant insert on storage.objects to authenticated;
      create policy existing_upload on storage.objects for insert to authenticated with check(true);`)
    for (const table of tables) await db.exec(`create table ${table}(id int); alter table ${table} enable row level security; grant select on ${table} to authenticated; create policy existing_rule on ${table} for select to authenticated using(true); insert into ${table} values(1);`)
    const sql = await readFile(new URL('../supabase_migration_2026_10_03_security_signup.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    await db.exec('create trigger signup_test after insert on auth.signup_fixture for each row execute function public.handle_new_user()')
    await db.query('insert into auth.signup_fixture values($1,$2,$3)', [signup, 'test@example.invalid', { role: 'chairperson', name: 'Test', is_active: true }])
    let user = (await db.query('select role,is_active from users where id=$1', [signup])).rows[0]
    assert.deepEqual(user, { role: 'ordinary_member', is_active: false })
    await as('authenticated', signup)
    assert.equal((await db.query('select count(*)::int as n from users')).rows[0].n, 1)
    await assert.rejects(db.query('insert into storage.objects values($1,$2)',['avatars','unapproved-upload']),/row-level security/)
    for (const table of tables) assert.equal((await db.query(`select count(*)::int as n from ${table}`)).rows[0].n, 0, table)
    assert.equal((await db.query('update users set role=$1 where id=$2 returning id', ['chairperson', signup])).rows.length, 0)
    await as('anon')
    assert.equal((await db.query('select count(*)::int as n from users')).rows[0].n, 0)
    await as('authenticated', manager)
    await db.query('update users set role=$1,is_active=true where id=$2', ['chairperson', signup])
    await as('authenticated', member)
    await db.query('insert into storage.objects values($1,$2)',['avatars','approved-upload'])
    const id = (await db.query('select fake_rpc_notify($1) as id', [member])).rows[0].id
    await db.query('update notifications set read_at=now() where id=$1', [id])
    await assert.rejects(db.query('update notifications set title=$1 where id=$2', ['Forged', id]), /permission denied/)
    await assert.rejects(db.query('insert into notifications(user_id,title) values($1,$2)', [manager, 'Forged']), /permission denied/)
    await assert.rejects(db.exec('truncate notifications'), /permission denied/)
    await as('postgres')
    user = (await db.query('select role,is_active from users where id=$1', [member])).rows[0]
    assert.deepEqual(user, { role: 'ordinary_member', is_active: true })
  } finally { await db.close() }
})
