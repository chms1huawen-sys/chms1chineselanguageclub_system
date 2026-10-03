import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('profile RPCs require active membership, bound input and preserve token ownership atomically', async () => {
  const db = new PGlite()
  const member = '10000000-0000-0000-0000-000000000001'
  const other = '10000000-0000-0000-0000-000000000002'
  const inactive = '10000000-0000-0000-0000-000000000003'
  async function as(role, id='') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
    await db.exec(`set role ${role}`)
  }
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon,authenticated;
      create table users(id uuid primary key,is_active boolean,avatar_url text,fcm_token text,notification_enabled boolean);
      create function active_member() returns boolean language sql stable security definer as $$ select exists(select 1 from users where id=auth.uid() and is_active) $$;
      create table push_subscriptions(user_id uuid,fcm_token text unique,device_key text,device_name text,platform text,is_active boolean,last_seen_at timestamptz);
      insert into users(id,is_active) values('${member}',true),('${other}',true),('${inactive}',false);
      insert into push_subscriptions values('${other}','other-token','device',null,'Android',true,now());`)
    const migration = await readFile(new URL('../supabase_migration_2026_10_03_profile_rpc_guard.sql',import.meta.url),'utf8')
    await db.exec(migration)
    await db.exec(migration)
    await as('anon')
    await assert.rejects(db.query('select update_my_avatar_url($1)',['https://example.com/a.jpg']),/permission denied/)
    await as('authenticated',inactive)
    await assert.rejects(db.query('select update_my_avatar_url($1)',['https://example.com/a.jpg']),/PROFILE_FORBIDDEN/)
    await assert.rejects(db.query('select update_my_notification_settings($1)',['inactive-token']),/PROFILE_FORBIDDEN/)
    await as('authenticated',member)
    for (const url of ['javascript:alert(1)','data:image/png;base64,x','https://example.com/\na.jpg','https://example.com/'+ 'a'.repeat(2048)]) {
      await assert.rejects(db.query('select update_my_avatar_url($1)',[url]),/INVALID_AVATAR_URL/)
    }
    await db.query('select update_my_avatar_url($1)',['https://example.com/a.jpg'])
    await db.query('select update_my_avatar_url($1)',[''])
    await assert.rejects(db.query('select update_my_notification_settings($1)',['a'.repeat(4097)]),/INVALID_PUSH_SETTINGS/)
    await assert.rejects(db.query('select update_my_notification_settings($1)',['bad token']),/INVALID_PUSH_SETTINGS/)
    await db.query('select update_my_notification_settings($1,true,$2,$3)',['own-token','device','Android'])
    await assert.rejects(db.query('select update_my_notification_settings($1,false,$2,$3)',['other-token','device','Android']),/PUSH_REGISTRATION_CONFLICT/)
    await as('postgres')
    assert.equal((await db.query("select user_id from push_subscriptions where fcm_token='other-token'")).rows[0].user_id,other)
    assert.equal((await db.query("select is_active from push_subscriptions where fcm_token='own-token'")).rows[0].is_active,true)
    assert.equal((await db.query('select fcm_token from users where id=$1',[member])).rows[0].fcm_token,'own-token')
    await as('authenticated',member)
    await db.query('select update_my_notification_settings($1,true,$2,$3)',['new-token','device','Android'])
    await db.query('select update_my_notification_settings($1,true,$2,$3)',['second-token','another-device','Android'])
    await as('postgres')
    assert.equal((await db.query("select count(*)::int n from push_subscriptions where user_id=$1 and is_active",[member])).rows[0].n,2)
  } finally { await db.close() }
})
