import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { BLOG_MANAGER_ROLES } from '../src/utils/blog.js'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const teacher = '10000000-0000-0000-0000-000000000001'
const member = '10000000-0000-0000-0000-000000000002'
const inactive = '10000000-0000-0000-0000-000000000003'
async function as(role, id = '') { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); set role ${role};`) }
try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
  create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth,storage,public to anon,authenticated;
  create table public.users(id uuid primary key,role text,is_active boolean);
  alter table public.users enable row level security;
  insert into public.users values('${teacher}','advisor_teacher',true),('${member}','ordinary_member',true),('${inactive}','chairperson',false);
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
  alter table storage.objects enable row level security;
  grant select,insert,delete on storage.objects to anon,authenticated;`)
  const migration = await readFile(new URL('../supabase_migration_2026_09_25_blog.sql', import.meta.url), 'utf8')
  await db.exec(migration); await db.exec(migration)
  await as('authenticated', teacher)
  const post = (await db.query(`select * from public.blog_save_post($1::jsonb,$2,null)`, [JSON.stringify({ title: 'Public story', slug: 'public-story', body: 'Hello', status: 'published' }), 'https://drive.google.com/drive/folders/private-album'])).rows[0]
  const draft = (await db.query(`select * from public.blog_save_post($1::jsonb,'',null)`, [JSON.stringify({ title: 'Draft story', slug: 'draft-story' })])).rows[0]
  const path = `${post.id}/20000000-0000-0000-0000-000000000001.jpg`
  const draftPath = `${draft.id}/20000000-0000-0000-0000-000000000002.jpg`
  await db.query(`insert into blog_media(post_id,path) values($1,$2),($3,$4)`, [post.id, path, draft.id, draftPath])
  await db.query(`insert into storage.objects(bucket_id,name) values('blog-photos',$1),('blog-photos',$2)`, [path, draftPath])
  await as('anon')
  assert.deepEqual((await db.query('select slug from blog_posts')).rows.map(p => p.slug), ['public-story'])
  assert.equal((await db.query('select * from blog_media')).rows.length, 1)
  assert.deepEqual((await db.query('select name from storage.objects')).rows.map(o => o.name), [path])
  await assert.rejects(db.query('select * from blog_downloads'), /permission denied/)
  await assert.rejects(db.query(`insert into blog_categories(name) values('Bad')`), /permission denied/)
  await as('authenticated', member)
  assert.equal((await db.query('select drive_url from blog_downloads')).rows[0].drive_url, 'https://drive.google.com/drive/folders/private-album')
  await assert.rejects(db.query(`select blog_save_post('{}'::jsonb,'',null)`), /BLOG_FORBIDDEN/)
  await assert.rejects(db.query(`insert into blog_posts(title,slug) values('Bad','bad')`), /row-level security/)
  await assert.rejects(db.query(`insert into blog_downloads(post_id,drive_url) values($1,'')`, [draft.id]), /row-level security/)
  await assert.rejects(db.query(`insert into storage.objects(bucket_id,name) values('blog-photos','bad.jpg')`), /row-level security/)
  await as('authenticated', inactive)
  assert.equal((await db.query('select * from blog_downloads')).rows.length, 0)
  assert.equal((await db.query('select blog_manager() value')).rows[0].value, false)
  await as('authenticated', teacher)
  await assert.rejects(db.query(`select blog_save_post($1::jsonb,'',999)`, [JSON.stringify(post)]), /BLOG_EDIT_CONFLICT/)
  const updated = (await db.query(`select * from blog_save_post($1::jsonb,$2,$3)`, [JSON.stringify({ ...post, status: 'hidden' }), 'https://drive.google.com/drive/folders/private-album', post.version])).rows[0]
  assert.equal(updated.version, post.version + 1)
  await as('anon')
  assert.equal((await db.query('select * from blog_posts')).rows.length, 0)
  assert.equal((await db.query('select * from storage.objects')).rows.length, 0)
  await as('authenticated', member)
  assert.equal((await db.query('select * from blog_downloads')).rows.length, 0)
  for (const role of BLOG_MANAGER_ROLES) {
    await db.exec(`reset role; update users set role='${role}' where id='${teacher}'`)
    await as('authenticated', teacher)
    assert.equal((await db.query('select blog_manager() value')).rows[0].value, true, role)
  }
  await db.exec(`reset role; update users set role='vice_chairperson' where id='${teacher}'`)
  await as('authenticated', teacher)
  assert.equal((await db.query('select blog_manager() value')).rows[0].value, false)
  console.log('Blog migration rerun, published-only reads, private album isolation, photo RLS, all editor roles, disabled accounts and save conflicts passed.')
} finally { await db.close() }
