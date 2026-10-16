import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { makePublicSnapshot } from '../src/utils/publicSnapshot.js'
import { buildPublicPreview } from '../server/publicPreview.js'
import { createPreviewWorker } from '../cloudflare/public-preview/worker.js'

const origin = 'https://chms1chineselanguageclubsystem.vercel.app'
const project = 'https://example.supabase.co'
const template = '<html><head></head><body><div id="root"></div></body></html>'
const input = {
  settings: { title: 'Club', content: { hero_slides: [{ path: project + '/storage/v1/object/public/blog-site-media/banner.jpg', link: origin + '/activities' }] } },
  posts: [{ id: 'one', slug: 'one', title: 'Public article', body: 'Public body', status: 'published', cover_path: 'one/original.jpg', tags: ['tag'], category_id: 'category' }, { id: 'draft', slug: 'draft', title: 'Secret draft', status: 'draft' }],
  media: [{ post_id: 'one', path: 'one/original.jpg', display_path: 'one/display.webp' }, { post_id: 'draft', path: 'draft/private.jpg' }],
  links: [{ post_id: 'one', url: 'https://secret.example', visibility: 'member' }], categories: [{ id: 'category', name: 'Category' }], tags: [{ id: 'tag', name: 'Tag' }],
}
const pack = (data, now) => {
  const snapshot = makePublicSnapshot(data, now)
  return { ...snapshot, publicPreview: buildPublicPreview(snapshot, template, project, origin) }
}
function setup() {
  let clock = Date.parse('2026-10-16T14:00:00Z')
  let data = pack(input, clock)
  let corrupt = false
  const objects = new Map()
  let assets = 0
  const env = {
    PUBLIC_SITE: {
      get: async key => {
        if (key !== 'public-site/v1/current.json') return objects.get(key) || null
        const text = JSON.stringify(data)
        return { size: text.length, text: async () => text, customMetadata: { sha256: corrupt ? 'bad' : createHash('sha256').update(text).digest('hex') } }
      },
      head: async key => objects.get(key) || null,
    },
    ASSETS: { fetch: async () => { assets++; return new Response('Old static page', { status: 404 }) } },
  }
  const worker = createPreviewWorker({ now: () => clock })
  return { worker, env, objects, assets: () => assets, set: value => { clock += 16000; data = pack(value, clock) }, corrupt: () => { clock += 16000; corrupt = true }, request: path => worker.fetch(new Request('https://preview.example' + path), env) }
}

test('published pages, data, labels and settings switch together; drafts and member data never export', async () => {
  const state = setup()
  let page = await state.request('/blog/one')
  assert.equal(page.status, 200)
  assert.match(await page.text(), /Public article/)
  assert.equal((await state.request('/blog/draft')).status, 404)
  let data = await (await state.request('/api/blog-public')).json()
  assert.equal(data.posts.length, 1)
  assert.equal(data.links.length, 0)
  assert.equal(data.media[0].path, '/public-media/blog-photos/one/display.webp')
  assert.equal(data.settings.content.hero_slides[0].link, '/activities')
  state.set({ ...input, settings: { title: 'Renamed', content: {} }, categories: [{ id: 'category', name: 'New category' }], tags: [{ id: 'tag', name: 'New tag' }], posts: input.posts.map(post => ({ ...post, title: 'Updated title' })) })
  data = await (await state.request('/api/blog-public')).json()
  assert.equal(data.settings.title, 'Renamed')
  assert.equal(data.categories[0].name, 'New category')
  assert.equal(data.tags[0].name, 'New tag')
  assert.match(await (await state.request('/blog/one')).text(), /Updated title/)
  assert.equal(state.assets(), 0)
})

test('withdrawal removes article, list, sitemap and photo access after the bounded cache interval', async () => {
  const state = setup()
  await state.request('/blog/one')
  state.set({ ...input, posts: input.posts.map(post => ({ ...post, status: 'draft' })) })
  assert.equal((await state.request('/blog/one')).status, 404)
  assert.equal((await state.request('/public-media/blog-photos/one/display.webp')).status, 404)
  assert.equal((await (await state.request('/api/blog-public')).json()).posts.length, 0)
  assert.ok(!(await (await state.request('/sitemap.xml')).text()).includes('/blog/one'))
  assert.equal(state.assets(), 0)
})

test('only listed verified images are served; missing copies warm through the existing authorized gateway', async () => {
  const state = setup()
  let response = await state.request('/public-media/blog-photos/one/display.webp')
  assert.equal(response.status, 302)
  assert.equal(new URL(response.headers.get('location')).origin, origin)
  const sha = 'a'.repeat(64)
  const key = 'photos-v1/blog-photos/one/display.webp'
  state.objects.set(key, { size: 3, customMetadata: { sha256: sha }, body: 'img', httpMetadata: { contentType: 'image/webp' }, httpEtag: '"photo"' })
  state.objects.set(key + '.verified', { size: 0, customMetadata: { sha256: sha } })
  response = await state.request('/public-media/blog-photos/one/display.webp')
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'img')
  assert.equal((await state.request('/public-media/blog-photos/draft/private.jpg')).status, 404)
  assert.equal((await state.request('/public-media/finance-receipts/one.jpg')).status, 404)
})

test('integrity failure fails closed instead of serving an obsolete static article', async () => {
  const state = setup()
  await state.request('/blog/one')
  state.corrupt()
  assert.equal((await state.request('/blog/one')).status, 503)
  assert.equal(state.assets(), 0)
})

test('preview stays noindex, rejects writes, and keeps member/admin/PWA on the original site', async () => {
  const state = setup()
  assert.equal((await state.request('/')).headers.get('x-robots-tag'), 'noindex, nofollow')
  for (const path of ['/member', '/blog-admin']) {
    const result = await state.request(path)
    assert.equal(result.status, 302)
    assert.equal(result.headers.get('location'), origin + path)
  }
  assert.equal((await state.request('/manifest.json')).status, 404)
  assert.equal((await state.request('/firebase-messaging-sw.js')).status, 404)
  assert.equal((await state.worker.fetch(new Request('https://preview.example/api/blog-public', { method: 'POST' }), state.env)).status, 405)
})

test('scheduler runs without a visitor, exposes failures, and only refreshes the fixed public endpoint', async () => {
  const time = Date.now()
  let calls = 0
  let task
  const worker = createPreviewWorker({ now: () => time, fetchOrigin: async (url, options) => {
    calls++
    assert.equal(url, origin + '/api/blog-public?refresh=1')
    assert.equal(options.redirect, 'error')
    assert.equal(options.method, 'HEAD')
    return new Response(null, { headers: { 'X-Public-Site-Checked-At': new Date(time).toISOString() } })
  } })
  await worker.scheduled({}, {}, { waitUntil: value => { task = value } })
  await task
  assert.equal(calls, 1)
  const failure = createPreviewWorker({ now: () => time, fetchOrigin: async () => new Response(null, { headers: { 'X-Public-Site-Checked-At': new Date(time - 300000).toISOString() } }) })
  await assert.rejects(failure.scheduled({}, {}, { waitUntil: value => value.catch(() => {}) }), /stale/)
})
