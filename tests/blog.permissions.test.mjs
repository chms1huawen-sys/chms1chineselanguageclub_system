import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { canManageBlog, BLOG_MANAGER_ROLES } from '../src/utils/blog.js'
import { hasPermission, PERMISSION_FIELDS } from '../src/utils/permissions.js'

test('Blog overrides inherit, grant and revoke without changing other permissions', () => {
  assert.ok(PERMISSION_FIELDS.includes('can_manage_blog'))
  for (const role of [...BLOG_MANAGER_ROLES, 'ordinary_member', 'custom', 'vice_chairperson']) {
    for (const override of [undefined, null, false, true]) {
      const profile = { role, is_active: true, can_manage_blog: override }
      const expected = override ?? BLOG_MANAGER_ROLES.includes(role)
      assert.equal(hasPermission(profile, 'can_manage_blog'), expected)
      assert.equal(canManageBlog(profile), expected)
      assert.equal(canManageBlog({ ...profile, is_active: false }), false)
      assert.equal(canManageBlog({ ...profile, is_active: undefined }), false)
    }
  }
  assert.equal(canManageBlog(null), false)
  assert.equal(hasPermission({ role: 'chairperson', can_manage_accounts: false }, 'can_manage_accounts'), true)
})

test('Blog SQL overrides and guarded profile writes', async () => {
  const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
  const db = new PGlite()
  const manager = '10000000-0000-0000-0000-000000000001'
  const member = '10000000-0000-0000-0000-000000000002'
  const inactive = '10000000-0000-0000-0000-000000000003'
  const custom = '10000000-0000-0000-0000-000000000004'
  async function as(role, id = '') {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false);
      select set_config('request.jwt.claim.role','${role}',false); set role ${role};`)
  }
  const effective = async () => (await db.query('select public.blog_manager() value')).rows[0].value
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$
        select nullif(current_setting('request.jwt.claim.role',true),'') $$;
      grant usage on schema auth to anon, authenticated, service_role;
      create table users(id uuid primary key, role text, is_active boolean, name text,
        can_manage_accounts boolean default false);
      grant select, insert, update on users to anon, authenticated, service_role;
      insert into users(id,role,is_active,can_manage_accounts) values
        ('${manager}','chairperson',true,false), ('${member}','ordinary_member',true,false),
        ('${inactive}','chairperson',false,false), ('${custom}','custom',true,true);`)
    // Use the real account-permission helper, not a more permissive test substitute.
    const permissions = await readFile(new URL('../supabase_migration_2026_08_23_custom_permissions.sql', import.meta.url), 'utf8')
    await db.exec(`alter table users add column can_manage_executive boolean default false,
      add column can_create_tasks boolean default false, add column can_manage_announcements boolean default false,
      add column can_manage_calendar boolean default false, add column can_view_leave_records boolean default false,
      add column can_manage_handover boolean default false;`)
    await db.exec(permissions.slice(permissions.indexOf('create or replace function public.current_user_has_permission'), permissions.indexOf('create or replace function public.handle_new_user')))
    await db.exec(`create schema storage;
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;`)
    await db.exec(await readFile(new URL('../supabase_migration_2026_09_25_blog.sql', import.meta.url), 'utf8'))
    const sql = await readFile(new URL('../supabase_migration_2026_09_25_blog_permissions.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    for (const role of [...BLOG_MANAGER_ROLES, 'ordinary_member', 'custom', 'vice_chairperson']) {
      for (const override of [null, true, false]) {
        await as('authenticated', manager)
        await db.query('update users set role=$1, can_manage_blog=$2 where id=$3', [role, override, member])
        await as('authenticated', member)
        const expected = override ?? BLOG_MANAGER_ROLES.includes(role)
        assert.equal(await effective(), expected, `${role}/${override}`)
        const write = () => db.query('insert into blog_categories(name) values($1)', [`${role}/${override}`])
        if (expected) await write()
        else await assert.rejects(write(), /row-level security/)
      }
    }
    await as('authenticated', manager)
    await db.query('update users set role=$1, can_manage_blog=false where id=$2', ['ordinary_member', member])
    await as('authenticated', member)
    await db.query('update users set name=$1 where id=$2', ['Profile edit', member])
    for (const override of [true, null]) {
      await assert.rejects(db.query('update users set can_manage_blog=$1 where id=$2', [override, member]), /BLOG_PERMISSION_FORBIDDEN/)
    }
    await assert.rejects(db.query(`insert into users(id,can_manage_blog) values(gen_random_uuid(),true)`), /BLOG_PERMISSION_FORBIDDEN/)
    await as('authenticated', inactive)
    await assert.rejects(db.query('update users set can_manage_blog=true where id=$1', [member]), /BLOG_PERMISSION_FORBIDDEN/)
    assert.equal(await effective(), false)
    await as('authenticated', custom)
    await db.query('update users set can_manage_blog=true where id=$1', [member])
    await db.query('update users set can_manage_blog=true where id=$1', [inactive])
    await as('authenticated', inactive)
    assert.equal(await effective(), false)
    await as('authenticated', member)
    assert.equal(await effective(), true)
    await as('anon')
    assert.equal(await effective(), false)
    await assert.rejects(db.query('update users set can_manage_blog=false where id=$1', [member]), /BLOG_PERMISSION_FORBIDDEN/)
    await as('authenticated')
    await assert.rejects(db.query('update users set can_manage_blog=false where id=$1', [member]), /BLOG_PERMISSION_FORBIDDEN/)
    await as('service_role')
    await db.query('update users set can_manage_blog=null where id=$1', [member])
  } finally {
    await db.close()
  }
})
