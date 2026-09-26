import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const teacher = '10000000-0000-0000-0000-000000000001'
const member = '10000000-0000-0000-0000-000000000002'
const q = async (sql, args = []) => (await db.query(sql, args)).rows
const sql = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8')
async function as(role, id = '') { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false); select set_config('request.jwt.claim.role','${role}',false); set role ${role}`) }
const save = async (post, links = [], version = null) => (await q('select * from blog_studio_save($1::jsonb,$2::jsonb,$3::uuid[],$4::jsonb,$5)', [JSON.stringify(post), JSON.stringify(links), [], '[]', version]))[0]
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
    grant usage on schema auth,storage,public to anon,authenticated,service_role;
    create table users(id uuid primary key,role text,is_active boolean);
    alter table users enable row level security;
    insert into users values('${teacher}','advisor_teacher',true),('${member}','ordinary_member',true);
    create function public.current_user_has_permission(text) returns boolean language sql stable security definer as $$ select auth.uid()='${teacher}'::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant select,insert,update,delete on storage.objects to anon,authenticated;`)
  for (const suffix of ['blog', 'blog_permissions', 'blog_studio', 'blog_analytics']) await db.exec(await sql(`supabase_migration_2026_09_25_${suffix}.sql`))
  await as('authenticated', teacher)
  const event = await save({ title: 'Existing event', slug: 'existing-event', content_type: 'event', content_year: 2026, status: 'published', tags: ['Original'] })
  await q("insert into blog_tags(name) values('Original')")
  const album = (await q("insert into blog_albums(title,status,content_year,event_id) values('Old photos','published',2026,$1) returning *", [event.id]))[0]
  const hidden = (await q("insert into blog_albums(title,status,content_year) values('Hidden photos','hidden',2025) returning *"))[0]
  for (const row of [album, hidden]) {
    await q("insert into blog_media(album_id,path) values($1,$2)", [row.id, `${row.id}/picture.jpg`])
    await q("insert into storage.objects(bucket_id,name) values('blog-photos',$1)", [`${row.id}/picture.jpg`])
  }
  await q('insert into blog_post_albums values($1,$2)', [event.id, album.id])
  await q('insert into blog_years(year,is_archived) values(2025,true) on conflict(year) do update set is_archived=true')
  await as('postgres')
  const migration = await sql('supabase_migration_2026_09_26_cultural_site.sql')
  await db.exec(migration)
  const snapshot = () => q('select id,title,status,version,updated_at,tag_ids,related_ids from blog_posts order by id')
  const before = await snapshot()
  await db.exec(migration)
  assert.deepEqual(await snapshot(), before, 'rerun preserves records and versions')
  assert.equal((await q('select count(*)::int as n from blog_albums'))[0].n, 2)
  assert.equal((await q('select count(*)::int as n from blog_media where album_id is not null'))[0].n, 0)
  assert.equal((await q('select post_id from blog_media where path=$1', [`${album.id}/picture.jpg`]))[0].post_id, album.id)
  assert.ok((await q('select related_ids from blog_posts where id=$1', [event.id]))[0].related_ids.includes(album.id))
  await as('anon')
  assert.equal((await q('select id from blog_posts where id=$1', [hidden.id])).length, 0)
  assert.equal((await q("select * from storage.objects where name=$1", [`${hidden.id}/picture.jpg`])).length, 0)
  assert.equal((await q("select * from storage.objects where name=$1", [`${album.id}/picture.jpg`])).length, 1)
  await assert.rejects(q('select * from users'), /permission denied/)
  await as('authenticated', teacher)
  const tag = (await q("select * from blog_tags where name='Original'"))[0]
  assert.deepEqual((await q('select tag_ids from blog_posts where id=$1', [event.id]))[0].tag_ids, [tag.id])
  await q("update blog_tags set name='Renamed',icon='✍',color='#346789',position=2 where id=$1", [tag.id])
  const book = await save({ title: 'Book', slug: 'book', content_year: 2026, content_type: 'publication', status: 'published', tag_ids: [tag.id], book_details: { author: 'Author', price: 'RM 20', isbn: '123' } }, [{ label: 'Private album', url: 'https://example.test/private', visibility: 'member' }])
  assert.equal(book.book_details.price, 'RM 20')
  assert.deepEqual(book.tags, ['Renamed'])
  const updated = await save({ ...book, title: 'Updated' }, [], book.version)
  assert.equal(updated.title, 'Updated')
  await assert.rejects(save({ ...book, title: 'Stale' }, [], book.version), /BLOG_EDIT_CONFLICT/)
  const article = await save({ title: 'Long draft', slug: 'long-draft', body: '文'.repeat(500), content_type: 'article', status: 'draft' })
  assert.equal(article.body.length, 500, 'no 450-character enforcement')
  const category = (await q("select * from blog_categories where name='学会出版'"))[0]
  await assert.rejects(save({ title: 'Wrong scope', slug: 'wrong-scope', category_id: category.id, content_type: 'event' }), /BLOG_CATEGORY_SECTION_MISMATCH/)
  const parent = (await q("select * from blog_categories where name='文学创作'"))[0]
  await assert.rejects(q('update blog_categories set parent_id=id where id=$1', [parent.id]), /BLOG_CATEGORY_PARENT_INVALID/)
  await assert.rejects(save({ ...(await q('select * from blog_posts where id=$1', [hidden.id]))[0], title: 'Locked' }, [], 1), /BLOG_YEAR_ARCHIVED/)
  await as('authenticated', member)
  await assert.rejects(save({ title: 'Unauthorized', slug: 'unauthorized' }), /BLOG_FORBIDDEN/)
  await as('anon')
  assert.equal((await q('select * from blog_links')).length, 0)
  assert.equal((await q('select id from blog_posts where id=$1', [article.id])).length, 0)
  for (const path of ['/literature', '/news']) assert.equal((await q("select blog_record_visit(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),$1) as ok", [path]))[0].ok, true)
  console.log('Cultural migration: repeatability, album paths/privacy, archives, stable tags, books, manual length review, taxonomy, permission checks passed.')
} finally { await db.close() }
