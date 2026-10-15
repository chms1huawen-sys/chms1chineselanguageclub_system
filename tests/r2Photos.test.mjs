import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createPhotoMirror, photoKey, r2PhotoConfig, validPhotoTarget } from '../server/r2Photos.js'
import { createBlogMediaHandler } from '../server/blogMedia.js'
import { blogMediaUrl } from '../src/utils/blogMediaUrl.js'
import { createSignedImageCache } from '../src/utils/signedImageCache.js'

const image = Buffer.from('test source image')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const path = '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.webp'
const target = { bucket: 'blog-photos', path, sourceUrl: 'https://example.supabase.co/storage/v1/object/sign/blog-photos/image.webp?token=secret' }
const configEnv = { R2_ENDPOINT: `https://${'a'.repeat(32)}.r2.cloudflarestorage.com`, R2_ACCESS_KEY_ID: 'id', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET_NAME: 'chms1clc-photos', VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon' }
function store(options = {}) {
  let object = options.object
  let verified = false
  const calls = { download: 0, put: 0, get: 0, head: 0 }
  const mirror = createPhotoMirror({
    head: async () => { calls.head++; if (!object) throw Object.assign(new Error(), { name: 'NotFound' }); return object },
    get: async () => { calls.get++; return new Response(options.corrupt ? 'bad copy' : object.bytes, { headers: { 'content-type': object.ContentType } }) },
    put: async (key, bytes, ContentType, sha256) => {
      calls.put++
      assert.equal(key, photoKey(target.bucket, target.path))
      object = { bytes, ContentType, ContentLength: bytes.length, Metadata: { sha256 } }
    },
    sign: async key => `https://r2.example/${key}?expires=300`,
    verified: async () => verified,
    markVerified: async () => { verified = true },
    fetchSource: async () => { calls.download++; return new Response(image, { headers: { 'content-type': options.mime || 'image/webp' } }) },
  })
  return { mirror, calls }
}

test('copy verifies bytes, MIME and checksum, resumes without downloading or overwriting', async () => {
  const { mirror, calls } = store()
  assert.match((await mirror(target)).signedUrl, /expires=300/)
  assert.equal(calls.put, 1)
  assert.equal(calls.get, 1)
  await mirror(target)
  assert.equal(calls.download, 1)
  assert.equal(calls.put, 1)
})

test('concurrent GETs copy once; HEAD does not copy', async () => {
  const { mirror, calls } = store()
  await assert.rejects(mirror({ ...target, headOnly: true }))
  assert.equal(calls.download, 0)
  await Promise.all([mirror(target), mirror(target), mirror(target)])
  assert.equal(calls.put, 1)
})

test('refuses existing unverified objects, corrupted copies and unsupported content', async () => {
  const existing = store({ object: { ContentLength: image.length, ContentType: 'image/webp', Metadata: {} } })
  await assert.rejects(existing.mirror(target), /refusing overwrite/)
  assert.equal(existing.calls.put, 0)
  const corrupt = store({ corrupt: true })
  await assert.rejects(corrupt.mirror(target), /checksum/)
  await assert.rejects(corrupt.mirror(target), /no verification marker/)
  const unsupported = store({ mime: 'text/html' })
  await assert.rejects(unsupported.mirror(target), /Unsupported/)
  assert.equal(unsupported.calls.put, 0)
})

test('configuration never accepts arbitrary endpoints; rollback disables R2', () => {
  assert.equal(r2PhotoConfig({}), null)
  assert.equal(r2PhotoConfig({ ...configEnv, R2_PHOTOS_DISABLED: 'true' }), null)
  assert.equal(r2PhotoConfig(configEnv).bucket, 'chms1clc-photos')
  for (const endpoint of ['https://evil.example', `${configEnv.R2_ENDPOINT}/path`, `${configEnv.R2_ENDPOINT}?key=secret`, configEnv.R2_ENDPOINT.replace('https:', 'http:')]) {
    assert.throws(() => r2PhotoConfig({ ...configEnv, R2_ENDPOINT: endpoint }))
  }
  for (const [bucket, value] of [['avatars', path], ['finance-receipts', path], ['blog-photos', '../x.jpg'], ['blog-site-media', 'a//b.jpg'], ['blog-photos', ['a/b.jpg']]]) assert.equal(validPhotoTarget(bucket, value), false)
})

function response() {
  return { code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this }, end() { return this }, send(body) { this.body = body; return this }, redirect(code, url) { this.code = code; this.url = url; return this } }
}
function database(allowed, state = {}) {
  return (url, key, options) => {
    assert.equal(key, 'anon')
    assert.equal(options.global, undefined)
    return {
      from: () => ({ select: () => ({ eq: () => ({ not: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) }) }),
      storage: { from: bucket => ({ createSignedUrl: async value => {
        state.checked = (state.checked || 0) + 1
        return allowed() ? { data: { signedUrl: `${url}/storage/v1/object/sign/${bucket}/${value}?token=allowed` } } : { error: new Error('Hidden') }
      } }) },
    }
  }
}

test('authorize every request, including cached R2 objects; hidden/draft/deleted never get a URL', async () => {
  let published = true
  let mirrored = 0
  const handler = createBlogMediaHandler({ env: configEnv, client: database(() => published), mirrorFactory: () => async () => { mirrored++; return { signedUrl: 'https://r2.example/verified', sha256: hash(image), bytes: image.length, contentType: 'image/webp' } } })
  let res = response()
  await handler({ method: 'GET', query: { path, format: 'json' }, headers: { authorization: 'Bearer staff-session' } }, res)
  assert.equal(JSON.parse(res.body).provider, 'r2')
  assert.equal(res.headers['Cache-Control'], 'no-store')
  published = false
  res = response()
  await handler({ method: 'GET', query: { path } }, res)
  assert.equal(res.code, 404)
  assert.equal(mirrored, 1)
})

test('R2 outage and disabled R2 fall back to authorized Supabase without leaking errors', async () => {
  for (const env of [configEnv, { ...configEnv, R2_PHOTOS_DISABLED: 'true' }]) {
    const handler = createBlogMediaHandler({ env, client: database(() => true), mirrorFactory: () => async () => { throw new Error('secret-access-key') } })
    const res = response()
    await handler({ method: 'GET', query: { path } }, res)
    assert.equal(res.code, 302)
    assert.match(res.url, /^https:\/\/example.supabase.co\//)
    assert.equal(res.headers['X-Blog-Media-Provider'], 'supabase')
    assert.ok(!JSON.stringify(res.headers).includes('secret-access-key'))
  }
})

test('invalid input never reaches Storage or R2; POST cannot upload arbitrary files', async () => {
  const state = {}
  const handler = createBlogMediaHandler({ env: configEnv, client: database(() => true, state) })
  for (const query of [{ path: [] }, { path, bucket: 'avatars' }, { path: 'a/../secret.png' }, { path, format: ['json'] }]) {
    const res = response()
    await handler({ method: 'GET', query }, res)
    assert.ok([400, 404].includes(res.code))
  }
  const res = response()
  await handler({ method: 'POST', query: { path } }, res)
  assert.equal(res.code, 405)
  assert.equal(state.checked, undefined)
})

test('route only this project public site media; keep external, local and private links unchanged', () => {
  const project = configEnv.VITE_SUPABASE_URL
  const siteImage = `${project}/storage/v1/object/public/blog-site-media/site/one.webp`
  assert.match(blogMediaUrl(siteImage, project), /^\/api\/blog-media\?bucket=blog-site-media/)
  assert.match(blogMediaUrl(path), /^\/api\/blog-media\?bucket=blog-photos/)
  for (const value of ['/logo.png', 'https://other.example/a/b.jpg', `${project}/storage/v1/object/sign/finance-receipts/a/b.jpg?token=secret`]) assert.equal(blogMediaUrl(value, project), value)
})

test('browser URL cache expires before the five-minute signed URL', async () => {
  let time = 0
  let calls = 0
  const sign = createSignedImageCache(async () => ({ data: { signedUrl: `url-${++calls}` } }), () => time, 240000)
  assert.equal((await sign(path)).data.signedUrl, 'url-1')
  time = 240001
  assert.equal((await sign(path)).data.signedUrl, 'url-2')
  assert.equal(hash(image).length, 64)
})
