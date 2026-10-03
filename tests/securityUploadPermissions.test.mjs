import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('upload authorization preserves bucket scope, server limits and staged direct-write protection', async () => {
  const db = new PGlite()
  const member = '10000000-0000-0000-0000-000000000001'
  const manager = '10000000-0000-0000-0000-000000000002'
  const inactive = '10000000-0000-0000-0000-000000000003'
  async function as(role,id='') {
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
    await db.exec(`set role ${role}`)
  }
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; grant usage on schema auth to anon,authenticated,service_role;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table users(id uuid primary key,is_active boolean,manager boolean);
      insert into users values('${member}',true,false),('${manager}',true,true),('${inactive}',false,true);
      create function active_member() returns boolean language sql stable security definer as $$select exists(select 1 from users where id=auth.uid() and is_active)$$;
      create function blog_manager() returns boolean language sql stable security definer as $$select exists(select 1 from users where id=auth.uid() and is_active and manager)$$;
      create function blog_asset_editable(text) returns boolean language sql stable as $$select blog_manager() and $1 like 'post/%'$$;
      create function inventory_access(text) returns boolean language sql stable as $$select blog_manager()$$;
      create function finance_access(text) returns boolean language sql stable as $$select active_member()$$;
      create schema storage; grant usage on schema storage to authenticated,service_role;
      create table storage.objects(bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant all on storage.objects to authenticated,service_role;
      create policy existing_upload on storage.objects for all to authenticated using(true) with check(true);`)
    await db.exec(await readFile(new URL('../supabase_migration_2026_10_03_secure_upload.sql',import.meta.url),'utf8'))
    await as('authenticated',member)
    const permitted = async (bucket,path) => (await db.query('select can_upload_validated_file($1,$2) as allowed',[bucket,path])).rows[0].allowed
    assert.equal(await permitted('avatars',`${member}/a.jpg`),true)
    assert.equal(await permitted('avatars',`${manager}/a.jpg`),false)
    assert.equal(await permitted('finance-receipts',`${member}/a.pdf`),true)
    assert.equal(await permitted('blog-site-media','a.jpg'),false)
    assert.equal(await permitted('inventory-photos','a.jpg'),false)
    await assert.rejects(db.query('select consume_upload_rate_limit($1)',[member]),/permission denied/)
    await as('authenticated',manager)
    assert.equal(await permitted('blog-site-media','a.jpg'),true)
    assert.equal(await permitted('blog-photos','post/a.jpg'),true)
    assert.equal(await permitted('blog-photos','unknown/a.jpg'),false)
    await as('authenticated',inactive)
    assert.equal(await permitted('avatars',`${inactive}/a.jpg`),false)
    await as('anon')
    await assert.rejects(db.query('select can_upload_validated_file($1,$2)',['avatars',`${member}/a.jpg`]),/permission denied/)
    await as('postgres')
    await db.exec(await readFile(new URL('../supabase_migration_2026_10_03_upload_gate_AFTER_DEPLOY.sql',import.meta.url),'utf8'))
    await db.exec(await readFile(new URL('../supabase_migration_2026_10_03_upload_gate_AFTER_DEPLOY.sql',import.meta.url),'utf8'))
    await as('authenticated',member)
    await assert.rejects(db.query('insert into storage.objects values($1,$2)',['avatars',`${member}/a.jpg`]),/row-level security/)
    await as('service_role')
    await db.query('insert into storage.objects values($1,$2)',['avatars',`${member}/a.jpg`])
    for (let i=1;i<=120;i++) assert.equal((await db.query('select consume_upload_rate_limit($1) as allowed',[member])).rows[0].allowed,true)
    assert.equal((await db.query('select consume_upload_rate_limit($1) as allowed',[member])).rows[0].allowed,false)
    assert.equal((await db.query('select consume_upload_rate_limit($1) as allowed',[manager])).rows[0].allowed,true)
  } finally { await db.close() }
})
