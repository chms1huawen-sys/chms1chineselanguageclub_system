import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { makePublicSnapshot } from '../src/utils/publicSnapshot.js'
import { buildPublicPreview } from '../server/publicPreview.js'
import { createPreviewWorker } from '../cloudflare/public-preview/worker.js'
import { snapshotStore, MAX_SNAPSHOT_BYTES } from '../server/publicSnapshot.js'
import { securityHeaders } from '../cloudflare/public-preview/securityHeaders.js'

const origin = 'https://chms1chineselanguageclubsystem.vercel.app'
const project = 'https://example.supabase.co'
const template = '<html><head><link rel="manifest" href="/manifest.json"></head><body><div id="root"></div></body></html>'
const input = {
  settings: { title: 'Club', content: { hero_slides: [{ path: project + '/storage/v1/object/public/blog-site-media/banner.jpg', link: origin + '/activities' }] } },
  posts: [{ id: 'one', slug: 'one', title: 'Public article', body: 'Public body', status: 'published', cover_path: 'one/original.jpg', tags: ['tag'], category_id: 'category' }, { id: 'draft', slug: 'draft', title: 'Secret draft', status: 'draft' }],
  media: [{ post_id: 'one', path: 'one/original.jpg', display_path: 'one/display.webp' }, { post_id: 'draft', path: 'draft/private.jpg' }],
  links: [{ post_id: 'one', url: 'https://secret.example', visibility: 'member' }], categories: [{ id: 'category', name: 'Category' }], tags: [{ id: 'tag', name: 'Tag' }],
}
const pack = (data, now) => {
  const snapshot = makePublicSnapshot(data, now)
  return { ...snapshot, publicPreview: buildPublicPreview(snapshot, template, project, origin, { publicOrigin: 'https://chms1clc.org' }) }
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
  assert.doesNotMatch(await (await state.request('/')).text(), /rel="manifest"/)
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

test('formal host has independent SEO pages and retains the source/member boundaries', async () => {
  const state = setup()
  const get = (path, indexable = 'false', host = 'chms1clc.org') => state.worker.fetch(new Request('https://' + host + path), { ...state.env, PUBLIC_SITE_INDEXABLE: indexable })
  let response = await get('/')
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  const html = await response.text()
  assert.match(html, /rel="canonical" href="https:\/\/chms1clc.org\/"/)
  assert.match(html, /"@type":"WebSite"[^<]*"url":"https:\/\/chms1clc.org\/"/)
  assert.ok(!html.includes(origin + '/activities'), 'Source-owned hero navigation stays on the public site')
  assert.doesNotMatch(html, /rel="manifest"/)
  response = await get('/', 'true')
  assert.equal(response.headers.get('x-robots-tag'), 'index, follow')
  assert.equal((await get('/?q=test', 'true')).headers.get('x-robots-tag'), 'noindex, follow')
  const sitemap = await (await get('/sitemap.xml', 'true')).text()
  assert.ok(sitemap.includes('<loc>https://chms1clc.org/blog/one</loc>'))
  assert.ok(!sitemap.includes(origin))
  assert.ok((await (await get('/robots.txt', 'true')).text()).includes('Sitemap: https://chms1clc.org/sitemap.xml'))
  for (const path of ['/member', '/blog-admin']) {
    response = await get(path, 'true')
    assert.equal(response.headers.get('location'), origin + path)
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  }
  assert.equal((await get('/blog/missing', 'true')).headers.get('x-robots-tag'), 'noindex, nofollow')
  assert.equal((await get('/', 'true', 'preview.workers.dev')).headers.get('x-robots-tag'), 'noindex, nofollow')
})

test('www redirects preserve path and query without redirecting source refresh or changing preview', async () => {
  const state = setup()
  const response = await state.worker.fetch(new Request('https://www.chms1clc.org/blog/one?tag=a%26b'), state.env)
  assert.equal(response.status, 308)
  assert.equal(response.headers.get('location'), 'https://chms1clc.org/blog/one?tag=a%26b')
  const insecure = await state.worker.fetch(new Request('http://chms1clc.org/about?q=hello'), state.env)
  assert.equal(insecure.status, 308)
  assert.equal(insecure.headers.get('location'), 'https://chms1clc.org/about?q=hello')
  assert.equal((await state.request('/blog/one')).status, 200)
})

test('formal host fails closed until its independently rendered bundle is published', async () => {
  const snapshot = pack(input, Date.now())
  delete snapshot.publicPreview.publicSite
  const body = JSON.stringify(snapshot)
  const worker = createPreviewWorker()
  const env = { PUBLIC_SITE: { get: async () => ({ size: body.length, text: async () => body,
    customMetadata: { sha256: createHash('sha256').update(body).digest('hex') } }) } }
  assert.equal((await worker.fetch(new Request('https://chms1clc.org/'), env)).status, 503)
  assert.equal((await worker.fetch(new Request('https://preview.example/'), env)).status, 200)
})

test('preview security headers cover HTML, data, static fallback, redirects and errors', async () => {
  const state = setup()
  for (const path of ['/', '/api/blog-public', '/logo-192.png', '/member', '/blog/missing']) {
    const response = await state.request(path)
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000')
    assert.equal(response.headers.get('permissions-policy'), 'camera=(), microphone=(), geolocation=()')
    const csp = response.headers.get('content-security-policy')
    assert.match(csp, /object-src 'none'/)
    assert.match(csp, /frame-ancestors 'none'/)
    assert.match(csp, /base-uri 'self'/)
    const script = csp.split('; ').find(rule => rule.startsWith('script-src '))
    assert.ok(script.includes(origin), 'Existing fixed-origin asset fallback remains supported')
    assert.ok(!script.includes('unsafe-inline') && !script.includes('unsafe-eval') && !script.includes('*'))
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  }
})

test('static asset preparation uses the same policy as dynamic responses', async () => {
  const prepare = await readFile(new URL('../scripts/prepare-cloudflare-runtime.mjs', import.meta.url), 'utf8')
  assert.match(prepare, /import \{ securityHeaders \} from/)
  assert.match(prepare, /Object\.entries\(securityHeaders\)/)
  assert.ok(!Object.hasOwn(securityHeaders, 'Cache-Control'), 'Do not disable normal asset caching')
})

test('scheduler runs without a visitor, exposes failures, and only refreshes the fixed public endpoint', async () => {
  const time = Date.now()
  let calls = 0
  let task
  const worker = createPreviewWorker({ now: () => time, fetchOrigin: async (url, options) => {
    calls++
    assert.equal(url, origin + '/api/blog-public?refresh=1')
    assert.equal(options.redirect, 'manual')
    assert.equal(options.method, 'HEAD')
    return new Response(null, { headers: { 'X-Public-Site-Checked-At': new Date(time).toISOString() } })
  } })
  await worker.scheduled({}, {}, { waitUntil: value => { task = value } })
  await task
  assert.equal(calls, 1)
  const failure = createPreviewWorker({ now: () => time, fetchOrigin: async () => new Response(null, { headers: { 'X-Public-Site-Checked-At': new Date(time - 300000).toISOString() } }) })
  await assert.rejects(failure.scheduled({}, {}, { waitUntil: value => value.catch(() => {}) }), /stale/)
  const redirect = createPreviewWorker({ fetchOrigin: async () => new Response(null, { status: 302, headers: { Location: 'https://untrusted.example' } }) })
  await assert.rejects(redirect.scheduled({}, {}, { waitUntil: value => value.catch(() => {}) }), /failed/)
})

test('deployed public routes invoke the worker rather than the static 404 fallback', async () => {
  const config = JSON.parse(await readFile(new URL('../cloudflare/public-preview/wrangler.jsonc', import.meta.url), 'utf8'))
  for (const section of ['literature', 'activities', 'bookroom', 'news', 'about']) {
    assert.ok(config.assets.run_worker_first.includes('/' + section))
    assert.ok(config.assets.run_worker_first.includes('/' + section + '/*'))
  }
  assert.ok(config.assets.run_worker_first.includes('/blog/*'))
  assert.ok(config.assets.run_worker_first.includes('/public-media/*'))
  assert.equal(config.triggers.crons[0], '* * * * *')
})

test('R2 publishes pages and JSON atomically, protects the revision and omits HTML from the public API data', async () => {
  const snapshot = makePublicSnapshot(input)
  let object
  let writes = 0
  const transport = { send: async command => {
    if (command.constructor.name === 'PutObjectCommand') {
      writes++
      assert.equal(command.input.IfMatch, 'previous-revision')
      object = command.input
      return {}
    }
    return { ContentLength: Buffer.byteLength(object.Body), Metadata: object.Metadata, ETag: 'next-revision', Body: { transformToString: async () => object.Body } }
  } }
  const store = snapshotStore({ bucket: 'test-bucket' }, async data => buildPublicPreview(data, template, project, origin), transport)
  await store.write(snapshot, 'previous-revision')
  const stored = JSON.parse(object.Body)
  assert.equal(stored.publicPreview.generatedAt, stored.generatedAt)
  assert.equal(stored.publicPreview.snapshot.posts[0].title, stored.posts[0].title)
  assert.equal(object.Metadata.sha256, createHash('sha256').update(object.Body).digest('hex'))
  const read = await store.read()
  assert.equal(read.etag, 'next-revision')
  assert.equal(read.snapshot.publicPreview, undefined)
  assert.equal(writes, 1)
  const broken = snapshotStore({ bucket: 'test-bucket' }, async () => { throw new Error('render failed') }, transport)
  await assert.rejects(broken.write(snapshot, 'previous-revision'), /render failed/)
  const large = snapshotStore({ bucket: 'test-bucket' }, async () => ({ html: 'x'.repeat(MAX_SNAPSHOT_BYTES) }), transport)
  await assert.rejects(large.write(snapshot, 'previous-revision'), /too large/)
  assert.equal(writes, 1)
})

test('concurrent cold reads share one R2 snapshot and failures can be retried', async () => {
  const state = setup()
  let reads = 0
  const get = state.env.PUBLIC_SITE.get
  state.env.PUBLIC_SITE.get = async key => { if (key === 'public-site/v1/current.json') reads++; return get(key) }
  await Promise.all(Array.from({ length: 12 }, () => state.request('/api/blog-public')))
  assert.equal(reads, 1)
  state.corrupt()
  assert.equal((await state.request('/')).status, 503)
  assert.equal((await state.request('/')).status, 503)
  assert.equal(reads, 3)
})

test('conditional images return body-free 304 only after public authorization and verification', async () => {
  const state = setup()
  const key = 'photos-v1/blog-photos/one/display.webp'
  const sha = 'a'.repeat(64)
  state.objects.set(key, { size: 3, customMetadata: { sha256: sha }, body: 'img', httpMetadata: { contentType: 'image/webp' }, httpEtag: '"photo"' })
  state.objects.set(key + '.verified', { size: 0, customMetadata: { sha256: sha } })
  let bodies = 0
  const get = state.env.PUBLIC_SITE.get
  state.env.PUBLIC_SITE.get = async path => { if (path === key) bodies++; return get(path) }
  const request = tag => state.worker.fetch(new Request('https://preview.example/public-media/blog-photos/one/display.webp', { headers: { 'If-None-Match': tag } }), state.env)
  for (const tag of ['"photo"', 'W/"photo"', '"other", "photo"', '*']) {
    const response = await request(tag)
    assert.equal(response.status, 304)
    assert.equal(await response.text(), '')
    assert.equal(response.headers.get('cache-control'), 'private, max-age=30')
  }
  assert.equal(bodies, 0)
  assert.equal((await request('"different"')).status, 200)
  assert.equal(bodies, 1)
  state.set({ ...input, posts: [] })
  assert.equal((await request('"photo"')).status, 404)
})
