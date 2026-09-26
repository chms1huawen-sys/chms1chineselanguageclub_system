import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const teacher = '10000000-0000-0000-0000-000000000001'
const member = '10000000-0000-0000-0000-000000000002'
const inactive = '10000000-0000-0000-0000-000000000003'
const sql = name => readFile(new URL(`../supabase_migration_2026_09_25_${name}.sql`, import.meta.url), 'utf8')

test('Studio database: migrations, atomic saves, visibility and archive enforcement', async t => {
  const db = new PGlite()
  const q = async (query, args = []) => (await db.query(query, args)).rows
  async function as(role, id = '') {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id}',false);
      select set_config('request.jwt.claim.role','${role}',false); set role ${role};`)
    assert.equal((await q('select current_user as role'))[0].role, role)
  }
  const save = async (post, links = [], albums = [], media = [], version = null) =>
    (await q('select * from blog_studio_save($1::jsonb,$2::jsonb,$3::uuid[],$4::jsonb,$5)',
      [JSON.stringify(post), JSON.stringify(links), albums, JSON.stringify(media), version]))[0]
  const makePost = (slug, extra = {}) => save({ title: slug, slug, content_year: 2026, ...extra })
  const album = async (title, status = 'published', year = 2026) =>
    (await q('insert into blog_albums(title,status,content_year) values($1,$2,$3) returning *', [title, status, year]))[0]
  async function media(owner, isAlbum = false) {
    const path = `${owner.id}/photo.jpg`
    const row = (await q(`insert into blog_media(${isAlbum ? 'album_id' : 'post_id'},path,caption) values($1,$2,'original') returning *`, [owner.id, path]))[0]
    await q("insert into storage.objects(bucket_id,name) values('blog-photos',$1)", [path])
    return row
  }
  async function check(name, fn) {
    await t.test(name, async () => {
      await db.exec('reset role; begin')
      try { await as('authenticated', teacher); await fn() }
      finally { await db.exec('rollback; reset role') }
    })
  }
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function auth.role() returns text language sql stable as $$ select nullif(current_setting('request.jwt.claim.role',true),'') $$;
      grant usage on schema auth,storage,public to anon,authenticated,service_role;
      create table users(id uuid primary key,role text,is_active boolean,
        can_manage_accounts boolean default false,can_manage_executive boolean default false,
        can_create_tasks boolean default false,can_manage_announcements boolean default false,
        can_manage_calendar boolean default false,can_view_leave_records boolean default false,
        can_manage_handover boolean default false);
      alter table users enable row level security;
      insert into users(id,role,is_active) values('${teacher}','advisor_teacher',true),('${member}','ordinary_member',true),('${inactive}','chairperson',false);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select,insert,update,delete on storage.objects to anon,authenticated;`)
    const permissions = await readFile(new URL('../supabase_migration_2026_08_23_custom_permissions.sql', import.meta.url), 'utf8')
    await db.exec(permissions.slice(permissions.indexOf('create or replace function public.current_user_has_permission'), permissions.indexOf('create or replace function public.handle_new_user')))
    await db.exec(await sql('blog'))
    await as('authenticated', teacher)
    const legacy = (await q(`select * from blog_save_post($1::jsonb,$2,null)`, [JSON.stringify({ title: 'Legacy', slug: 'legacy', body: 'Preserve me', status: 'published', event_date: '2023-03-01', tags: ['History'] }), 'https://drive.google.com/drive/folders/legacy']))[0]
    const legacyMedia = await media(legacy)
    await db.exec('reset role')
    const migrations = await Promise.all(['blog_permissions', 'blog_studio', 'blog_analytics'].map(sql))
    for (const migration of migrations) await db.exec(migration)
    const snapshot = async () => {
      const result = {}
      for (const table of ['blog_posts', 'blog_downloads', 'blog_media', 'blog_links', 'blog_tags', 'blog_years', 'blog_settings']) {
        result[table] = await q(`select * from ${table} order by 1`)
      }
      return result
    }
    const before = await snapshot()
    for (const migration of migrations) await db.exec(migration)
    await t.test('new migrations rerun without changing legacy rows or duplicating links', async () => {
      assert.deepEqual(await snapshot(), before)
      const migrated = (await q('select * from blog_posts where id=$1', [legacy.id]))[0]
      for (const key of Object.keys(legacy)) assert.deepEqual(migrated[key], legacy[key], key)
      assert.equal(migrated.content_year, 2023)
      assert.deepEqual((await q('select * from blog_media where id=$1', [legacyMedia.id]))[0], { ...legacyMedia, album_id: null })
      assert.equal((await q('select * from blog_downloads')).length, 1)
      assert.equal((await q("select * from blog_links where visibility='member' and type='drive'")).length, 1)
    })

    await check('analytics consent endpoint validates pages, deduplicates, and protects reports', async () => {
      await makePost('analytics-public', { status: 'published' })
      await makePost('analytics-private', { status: 'draft' })
      const record = async path => (await q('select blog_record_visit(gen_random_uuid(),$1,$2,$3,$4,$5) as ok', [member, inactive, path, 'https://example.test/private?email=secret', 'mobile']))[0].ok
      assert.equal(await record('/'), false)
      await as('anon')
      assert.equal(await record('/blog-admin'), false)
      assert.equal(await record('/#/tasks'), false)
      assert.equal(await record('/blog/analytics-private'), false)
      assert.equal(await record('/blog/analytics-public'), true)
      assert.equal(await record('/blog/analytics-public'), false)
      assert.equal(await record('/'), true)
      await db.exec('savepoint forbidden')
      await assert.rejects(q('select * from blog_visits'), /permission denied/)
      await db.exec('rollback to savepoint forbidden')
      await as('authenticated', member)
      await db.exec('savepoint report')
      await assert.rejects(q('select blog_analytics_report(current_date,current_date+1)'), /BLOG_FORBIDDEN/)
      await db.exec('rollback to savepoint report')
      await as('authenticated', teacher)
      const result = (await q('select blog_analytics_report(current_date-1,current_date+2) as data'))[0].data
      assert.equal(result.views, 2)
      assert.equal(result.visitors, 1)
      assert.equal(result.sessions, 1)
      assert.equal(result.sources[0].source, '(direct)')
      assert.equal(JSON.stringify(result).includes(member), false)
      assert.equal(JSON.stringify(result).includes('secret'), false)
      await db.exec('savepoint range')
      await assert.rejects(q('select blog_analytics_report(current_date,current_date+367)'), /BLOG_ANALYTICS_RANGE_INVALID/)
      await db.exec('rollback to savepoint range')
    })

    await check('atomic RPC saves links, album association and captions; stale versions change nothing', async () => {
      let post = await makePost('atomic')
      const a = await album('Atomic album')
      const m = await media(post)
      const links = [{ label: 'Website', url: 'https://example.org/public', visibility: 'public' }, { label: 'Private generic', url: 'https://example.net/member', visibility: 'member' }]
      post = await save({ ...post, title: 'Updated' }, links, [a.id], [{ id: m.id, caption: 'Updated caption' }], post.version)
      assert.equal(post.version, 2)
      assert.equal((await q('select * from blog_links where post_id=$1', [post.id])).length, 2)
      assert.equal((await q('select * from blog_post_albums where post_id=$1', [post.id])).length, 1)
      assert.equal((await q('select caption from blog_media where id=$1', [m.id]))[0].caption, 'Updated caption')
      const state = await q('select * from blog_posts where id=$1', [post.id])
      await db.exec('savepoint failed_save')
      await assert.rejects(save({ ...post, title: 'Stale' }, [], [], [], 1), /BLOG_EDIT_CONFLICT/)
      await db.exec('rollback to failed_save')
      assert.deepEqual(await q('select * from blog_posts where id=$1', [post.id]), state)
      await assert.rejects(save({ ...post, title: 'Must roll back' }, [{ label: 'Bad', url: 'javascript:alert(1)' }], [], [{ id: m.id, caption: 'Bad' }], post.version), /check constraint/)
      await db.exec('rollback to failed_save')
      assert.deepEqual(await q('select * from blog_posts where id=$1', [post.id]), state)
      assert.equal((await q('select * from blog_links where post_id=$1', [post.id])).length, 2)
      assert.equal((await q('select * from blog_post_albums where post_id=$1', [post.id])).length, 1)
      assert.equal((await q('select caption from blog_media where id=$1', [m.id]))[0].caption, 'Updated caption')
    })
    await check('generic member URLs are gated and drafts hide every dependent resource', async () => {
      const links = [{ label: 'Public', url: 'https://example.org/open', visibility: 'public' }, { label: 'Member', url: 'https://example.org/secret', visibility: 'member' }]
      const published = await save({ title: 'Public', slug: 'public', status: 'published' }, links)
      const draft = await save({ title: 'Draft', slug: 'draft' }, links)
      const visible = await media(published)
      const hidden = await media(draft)
      for (const [role, id, count] of [['anon', '', 1], ['authenticated', member, 2], ['authenticated', inactive, 1]]) {
        await as(role, id)
        assert.equal((await q('select * from blog_links where post_id=$1', [published.id])).length, count)
        assert.equal((await q('select * from blog_links where post_id=$1', [draft.id])).length, 0)
        assert.equal((await q('select * from blog_posts where id=$1', [draft.id])).length, 0)
        assert.equal((await q('select * from blog_media where id=$1', [hidden.id])).length, 0)
        assert.equal((await q('select * from storage.objects where name=$1', [hidden.path])).length, 0)
        assert.equal((await q('select * from storage.objects where name=$1', [visible.path])).length, 1)
      }
    })
    await check('independent album media and storage are public only when published', async () => {
      const entries = []
      for (const status of ['published', 'draft', 'hidden', 'trash']) {
        const a = await album(status, status)
        entries.push({ a, m: await media(a, true) })
      }
      for (const [role, id] of [['anon', ''], ['authenticated', member]]) {
        await as(role, id)
        for (const { a, m } of entries) {
          const count = a.status === 'published' ? 1 : 0
          assert.equal((await q('select * from blog_albums where id=$1', [a.id])).length, count, a.status)
          assert.equal((await q('select * from blog_media where id=$1', [m.id])).length, count, a.status)
          assert.equal((await q('select * from storage.objects where name=$1', [m.path])).length, count, a.status)
        }
      }
    })
    await check('trash and restore retain data but expose no trashed post or album assets', async () => {
      let p = await makePost('trash', { status: 'published' })
      const m = await media(p)
      const a = await album('Trash album')
      const am = await media(a, true)
      p = await save({ ...p, status: 'trash' }, [], [], [], p.version)
      assert.ok(p.deleted_at)
      await q("update blog_albums set status='trash' where id=$1", [a.id])
      await as('anon')
      assert.equal((await q('select * from blog_posts where id=$1', [p.id])).length, 0)
      assert.equal((await q('select * from blog_media where id=any($1::uuid[])', [[m.id, am.id]])).length, 0)
      assert.equal((await q('select * from storage.objects where name=any($1::text[])', [[m.path, am.path]])).length, 0)
      await as('authenticated', teacher)
      p = await save({ ...p, status: 'draft' }, [], [], [], p.version)
      assert.equal(p.deleted_at, null)
      assert.equal((await q("update blog_albums set status='draft' where id=$1 returning deleted_at", [a.id]))[0].deleted_at, null)
      assert.equal((await q('select * from blog_media where id=any($1::uuid[])', [[m.id, am.id]])).length, 2)
      await as('anon')
      assert.equal((await q('select * from storage.objects where name=any($1::text[])', [[m.path, am.path]])).length, 0)
    })

    for (const operation of ['post update', 'post delete', 'post move year', 'media update', 'media delete', 'album update', 'album delete', 'storage insert', 'storage delete', 'storage update']) {
      await check(`archived year prevents ${operation}`, async () => {
        const p = await makePost('locked', { content_year: 2024, status: 'published' })
        const m = await media(p)
        const a = await album('Locked album', 'published', 2024)
        await q('update blog_years set is_archived=true where year=2024')
        const statements = {
          'post update': ['update blog_posts set title=\'Bad\' where id=$1 returning id', [p.id]],
          'post delete': ['delete from blog_posts where id=$1 returning id', [p.id]],
          'post move year': ['update blog_posts set content_year=2026 where id=$1 returning id', [p.id]],
          'media update': ['update blog_media set caption=\'Bad\' where id=$1 returning id', [m.id]],
          'media delete': ['delete from blog_media where id=$1 returning id', [m.id]],
          'album update': ['update blog_albums set title=\'Bad\' where id=$1 returning id', [a.id]],
          'album delete': ['delete from blog_albums where id=$1 returning id', [a.id]],
          'storage insert': ["insert into storage.objects(bucket_id,name) values('blog-photos',$1) returning id", [`${p.id}/new.jpg`]],
          'storage delete': ['delete from storage.objects where name=$1 returning id', [m.path]],
          'storage update': ['update storage.objects set name=$1 where name=$2 returning id', [`${p.id}/renamed.jpg`, m.path]],
        }
        const [statement, args] = statements[operation]
        try { assert.equal((await q(statement, args)).length, 0, `${operation} must not modify archived content`) }
        catch (error) { if (!/BLOG_YEAR_ARCHIVED|row-level security|permission denied/.test(error.message)) throw error }
      })
    }
    for (const operation of ['insert', 'delete', 'update']) {
      await check(`cross-year association ${operation} respects the album's archived year`, async () => {
        const p = await makePost('open-post')
        const a = await album('Archived album', 'published', 2024)
        const other = await album('Open album')
        await q('insert into blog_post_albums values($1,$2)', [p.id, a.id])
        await q('update blog_years set is_archived=true where year=2024')
        const statement = operation === 'insert'
          ? ['insert into blog_post_albums values($1,$2)', [(await makePost('second-post')).id, a.id]]
          : operation === 'delete'
            ? ['delete from blog_post_albums where post_id=$1 and album_id=$2', [p.id, a.id]]
            : ['update blog_post_albums set album_id=$3 where post_id=$1 and album_id=$2', [p.id, a.id, other.id]]
        await assert.rejects(q(...statement), /BLOG_YEAR_ARCHIVED/)
      })
    }
    await check('scheduled promotion only publishes due posts in unlocked years', async () => {
      const due = await makePost('due', { status: 'scheduled', scheduled_at: '2020-01-01T00:00:00Z' })
      const future = await makePost('future', { status: 'scheduled', scheduled_at: '2199-01-01T00:00:00Z' })
      const locked = await makePost('locked-scheduled', { content_year: 2024, status: 'scheduled', scheduled_at: '2020-01-01T00:00:00Z' })
      await q('update blog_years set is_archived=true where year=2024')
      await as('anon')
      assert.equal((await q('select blog_publish_due() as n'))[0].n, 1)
      assert.equal((await q('select blog_publish_due() as n'))[0].n, 0)
      const visible = await q('select * from blog_posts where id=$1', [due.id])
      assert.equal(visible[0].published_at.toISOString(), '2020-01-01T00:00:00.000Z')
      assert.equal((await q('select * from blog_posts where id=any($1::uuid[])', [[future.id, locked.id]])).length, 0)
    })
    for (const id of [member, inactive, '']) {
      await check(`non-manager ${id || 'missing identity'} cannot save`, async () => {
        await as('authenticated', id)
        await assert.rejects(makePost('unauthorized'), /BLOG_FORBIDDEN/)
      })
    }
  } finally { await db.close() }
})
