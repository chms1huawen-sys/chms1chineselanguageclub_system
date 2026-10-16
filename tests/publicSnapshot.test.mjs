import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makePublicSnapshot, validPublicSnapshot, snapshotArticle, snapshotMoments } from '../src/utils/publicSnapshot.js'
import { createSnapshotService } from '../server/publicSnapshot.js'
import { createPublicSnapshotHandler } from '../server/publicSnapshotHandler.js'
import { snapshotPhotoPath } from '../server/snapshotPhotos.js'
import { renderSnapshotPage } from '../server/snapshotPage.js'
import { createPublicSnapshotReader, syncPublicSnapshot } from '../src/utils/publicSnapshotClient.js'
import { staticPublicSnapshot, renderStaticPreviewPage } from '../scripts/export-public-site.mjs'
import { blogMediaUrl } from '../src/utils/blogMediaUrl.js'

const time = Date.parse('2026-10-16T00:00:00Z')
const input = {
  settings: { title: 'Test club', subtitle: 'School', intro: 'Public introduction', service_role_key: 'never-export', content: { site_name: 'Test club', private_token: 'never-export', hero_slides: [{ path: '/one.jpg', title: 'Hello', private_token: 'never-export' }], social_links: [{ label: 'Email', url: 'mailto:club@example.com', platform: 'email', secret: 'never-export' }] } },
  posts: [{ id: 'p', slug: 'public-story', title: 'Public story', body: 'Searchable public text', status: 'published', content_type: 'event', cover_path: 'p/photo.jpg', featured: true, created_by: 'never-export', updated_at: new Date(time).toISOString(), published_at: new Date(time).toISOString(), book_details: { author: 'Author', internal_note: 'never-export' } }, { id: 'draft', slug: 'draft', title: 'Private draft', status: 'draft' }, { id: 'hidden', slug: 'hidden', status: 'hidden' }],
  media: [{ id: 'm', post_id: 'p', path: 'p/photo.jpg', display_path: 'p/display.webp', original_path: 'never-export', caption: 'Public image', position: 0 }, { post_id: 'draft', path: 'draft/private.jpg' }],
  links: [{ post_id: 'p', visibility: 'public', label: 'Public link', url: 'https://example.com', type: 'link' }, { post_id: 'p', visibility: 'member', url: 'never-export' }],
  categories: [{ id: 'c', name: 'Events', created_by: 'never-export' }], tags: [],
}

test('export contains only published content and explicit public fields', () => {
  const snapshot = makePublicSnapshot(input, time)
  assert.ok(validPublicSnapshot(snapshot))
  assert.equal(snapshot.posts.length, 1)
  assert.equal(snapshot.media.length, 1)
  assert.equal(snapshot.links.length, 1)
  assert.ok(!JSON.stringify(snapshot).includes('never-export'))
  assert.equal(snapshotArticle(snapshot, 'draft'), null)
  assert.equal(snapshotArticle(snapshot, 'public-story').media[0].caption, 'Public image')
  assert.equal(snapshotMoments(snapshot)[0].moment_path, 'p/photo.jpg')
  assert.equal(validPublicSnapshot({ ...snapshot, links: [{ post_id: 'p', visibility: 'member' }] }), false)
})

function stateStore(initial) {
  let current = initial ? { snapshot: initial, etag: 'v1' } : null
  let revision = 1
  return { read: async () => current, write: async (snapshot, etag) => {
    if (current && current.etag !== etag) throw Object.assign(new Error('Conflict'), { $metadata: { httpStatusCode: 412 } })
    current = { snapshot, etag: `v${++revision}` }
  } }
}

test('cold export is shared and force sync withdraws hidden stories and images', async () => {
  let builds = 0
  let next = input
  const service = createSnapshotService({ store: stateStore(), now: () => time, source: { checkDue: async () => false, build: async now => { builds++; return makePublicSnapshot(next, now) } } })
  const results = await Promise.all([service.get(), service.get(), service.get()])
  assert.equal(builds, 1)
  assert.equal(results[0].posts.length, 1)
  next = { ...input, posts: [] }
  const withdrawn = await service.get({ force: true })
  assert.equal(withdrawn.posts.length, 0)
  assert.equal(withdrawn.media.length, 0)
})

test('published snapshot remains readable while Supabase is unavailable', async () => {
  const snapshot = makePublicSnapshot(input, time - 7200000)
  const tasks = []
  let checks = 0
  const service = createSnapshotService({ store: stateStore(snapshot), now: () => time, defer: task => tasks.push(task), source: { checkDue: async () => { checks++; throw new Error('offline') }, build: async () => { throw new Error('offline') } } })
  assert.equal((await service.get()).posts[0].title, 'Public story')
  await Promise.all(tasks)
  assert.equal(checks, 1)
  await assert.rejects(service.get({ force: true }))
})

test('scheduled publication rebuilds once when due; unchanged snapshots only update check time', async () => {
  let clock = time
  let builds = 0
  let due = false
  const service = createSnapshotService({ store: stateStore(makePublicSnapshot(input, time - 120000)), now: () => clock, source: { checkDue: async () => due, build: async now => { builds++; return makePublicSnapshot(input, now) } } })
  await service.get({ refresh: true })
  assert.equal(builds, 0)
  clock += 61000
  due = true
  await service.get({ refresh: true })
  assert.equal(builds, 1)
})

test('conditional-write conflict cannot silently overwrite a newer public snapshot', async () => {
  const store = stateStore(makePublicSnapshot(input, time - 120000))
  let writes = 0
  const write = store.write
  store.write = async (data, etag) => { if (++writes === 1) throw Object.assign(new Error('Conflict'), { $metadata: { httpStatusCode: 412 } }); await write(data, etag) }
  const service = createSnapshotService({ store, now: () => time, source: { checkDue: async () => false, build: async now => makePublicSnapshot(input, now) } })
  assert.ok(validPublicSnapshot(await service.get({ force: true })))
  assert.equal(writes, 2)
})

test('a slow background refresh cannot restore a story withdrawn by a manager', { timeout: 1000 }, async () => {
  let release
  const gate = new Promise(resolve => { release = resolve })
  const tasks = []
  const store = stateStore(makePublicSnapshot(input, time - 120000))
  const service = createSnapshotService({ store, now: () => time, defer: task => tasks.push(task), source: { checkDue: async () => { await gate; return false }, build: async now => makePublicSnapshot({ ...input, posts: [] }, now) } })
  await service.get()
  await Promise.resolve()
  const withdrawn = await service.get({ force: true })
  assert.equal(withdrawn.posts.length, 0)
  release()
  await Promise.all(tasks)
  assert.equal((await store.read()).snapshot.posts.length, 0)
})

function response() {
  return { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.statusCode = code; return this }, end() { return this }, send(body) { this.body = body; return this } }
}

test('force publishing requires valid login, manager permission and same origin', async () => {
  let writes = 0
  const env = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon', BLOG_SITE_URL: 'https://site.example' }
  const factory = (signedIn, allowed) => createPublicSnapshotHandler({ env, snapshot: async () => { writes++; return makePublicSnapshot(input, time) }, client: () => ({ auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'actor' } : null } }) }, rpc: async () => ({ data: allowed }) }) })
  for (const [handler, req, status] of [
    [factory(true, true), { method: 'POST', headers: {} }, 401],
    [factory(false, true), { method: 'POST', headers: { authorization: 'Bearer token' } }, 401],
    [factory(true, false), { method: 'POST', headers: { authorization: 'Bearer token' } }, 403],
    [factory(true, true), { method: 'POST', headers: { authorization: 'Bearer token', origin: 'https://evil.example' } }, 403],
  ]) { const res = response(); await handler(req, res); assert.equal(res.statusCode, status) }
  assert.equal(writes, 0)
  const res = response()
  await factory(true, true)({ method: 'POST', headers: { authorization: 'Bearer token', origin: 'https://site.example' } }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(JSON.parse(res.body).synced, true)
  assert.equal(writes, 1)
})

test('snapshot images resolve only currently public references, without exposing originals', () => {
  const snapshot = makePublicSnapshot(input, time)
  assert.equal(snapshotPhotoPath(snapshot, 'blog-photos', 'p/photo.jpg', 'https://example.supabase.co'), 'p/display.webp')
  assert.equal(snapshotPhotoPath(snapshot, 'blog-photos', 'draft/private.jpg', 'https://example.supabase.co'), null)
  assert.equal(snapshotPhotoPath(snapshot, 'finance-receipts', 'p/photo.jpg', 'https://example.supabase.co'), null)
})

test('SSR, search and missing-page handling reuse the current rendering and canonical URLs', () => {
  const snapshot = makePublicSnapshot(input, time)
  const template = '<html><head><title>old</title></head><body><div id="root"></div></body></html>'
  const page = renderSnapshotPage(template, snapshot, { slug: 'public-story', view: 'home', search: '' }, 'https://site.example')
  assert.equal(page.status, 200)
  assert.ok(page.html.includes('Searchable public text'))
  assert.ok(page.html.includes('https://site.example/blog/public-story'))
  assert.ok(!page.html.includes('never-export'))
  assert.equal(renderSnapshotPage(template, snapshot, { slug: 'draft', view: 'home', search: '' }, 'https://site.example').status, 404)
})

test('client reads one shared snapshot and never treats a failed synchronization as saved', async () => {
  let calls = 0
  const read = createPublicSnapshotReader(async () => { calls++; return Response.json(makePublicSnapshot(input, time)) }, () => time)
  await Promise.all([read(), read()])
  assert.equal(calls, 1)
  const db = { auth: { getSession: async () => ({ data: { session: { access_token: 'test-session' } } }) } }
  await assert.rejects(syncPublicSnapshot(db, async () => new Response('', { status: 503 })), /PUBLIC_SYNC_FAILED/)
})

test('static preview rewrites covers, gallery and rich text to local compressed copies', () => {
  const source = makePublicSnapshot(input, time)
  source.posts[0].body_document = { type: 'doc', content: [{ type: 'image', attrs: { src: 'p/photo.jpg' } }] }
  const { snapshot, candidates } = staticPublicSnapshot(source, 'https://example.supabase.co')
  assert.equal(candidates.length, 1)
  assert.equal(snapshot.posts[0].cover_path, '/public-media/blog-photos/p/display.webp')
  assert.equal(snapshot.media[0].path, snapshot.posts[0].cover_path)
  assert.equal(snapshot.posts[0].body_document.content[0].attrs.src, snapshot.posts[0].cover_path)
  assert.ok(validPublicSnapshot(snapshot))
})

test('root-level public site images migrate and static SSR images stay on the preview origin', () => {
  const url = 'https://example.supabase.co/storage/v1/object/public/blog-site-media/banner.jpg'
  const source = makePublicSnapshot({ ...input, settings: { ...input.settings, hero_path: url, content: { about_image: url } } }, time)
  assert.equal(snapshotPhotoPath(source, 'blog-site-media', 'banner.jpg', 'https://example.supabase.co'), 'banner.jpg')
  assert.equal(snapshotPhotoPath(source, 'blog-site-media', 'unlisted.jpg', 'https://example.supabase.co'), null)
  assert.match(blogMediaUrl(url, 'https://example.supabase.co'), /^\/api\/blog-media\?bucket=blog-site-media/)
  const { snapshot, candidates } = staticPublicSnapshot(source, 'https://example.supabase.co')
  assert.equal(candidates.length, 2)
  assert.equal(snapshot.settings.hero_path, '/public-media/blog-site-media/banner.jpg')
  assert.equal(snapshot.settings.content.about_image, snapshot.settings.hero_path)
  const page = renderStaticPreviewPage('<html><head></head><body><div id="root"></div></body></html>', snapshot, { slug: '', view: 'home', search: '' }, 'https://site.example')
  assert.ok(page.html.includes('src="/public-media/blog-site-media/banner.jpg"'))
  assert.ok(!page.html.includes('https://site.example/public-media/'))
  assert.ok(page.html.includes('rel="canonical" href="https://site.example/"'))
})
