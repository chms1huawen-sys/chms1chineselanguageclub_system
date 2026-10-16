import process from 'node:process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'

const PREVIEW = 'https://chms1clc-public-preview.chms1chineselanguageclub-system.workers.dev'
const MAX_REQUESTS = 16
const MAX_BYTES = 3 * 1024 * 1024

export async function auditPublicTraffic(request = fetch) {
  const results = []
  let totalBytes = 0
  async function read(path, method = 'GET', headers = {}) {
    if (!path.startsWith('/') || path.startsWith('//') || results.length >= MAX_REQUESTS) throw new Error('Audit request boundary exceeded')
    const start = Date.now()
    const response = await request(PREVIEW + path, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(15000) })
    const chunks = []
    let size = 0
    if (response.body) {
      for await (const chunk of response.body) {
        size += chunk.byteLength
        totalBytes += chunk.byteLength
        if (totalBytes > MAX_BYTES) throw new Error('Audit download budget exceeded')
        chunks.push(chunk)
      }
    }
    const body = Buffer.concat(chunks).toString('utf8')
    results.push({ path, method, status: response.status, milliseconds: Date.now() - start, bytes: size,
      cacheControl: response.headers.get('cache-control'), provider: response.headers.get('x-public-preview-version'),
      contentType: response.headers.get('content-type'), redirectOrigin: response.headers.get('location') ? new URL(response.headers.get('location'), PREVIEW).origin : null })
    return { response, body }
  }
  const first = await read('/api/blog-public')
  if (first.response.status !== 200) throw new Error('Public snapshot unavailable; audit stopped')
  const snapshot = JSON.parse(first.body)
  if (!Array.isArray(snapshot.posts) || snapshot.posts.some(post => post.status !== 'published')) throw new Error('Invalid public source; audit stopped')
  for (const path of ['/', '/literature', '/activities', '/bookroom']) await read(path)
  const post = snapshot.posts.find(row => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug))
  if (post) await read('/blog/' + post.slug)
  const image = [snapshot.settings?.hero_path, ...snapshot.media.map(row => row.path)].find(path => typeof path === 'string' && /^\/public-media\/(blog-photos|blog-site-media)\/[a-zA-Z0-9_./-]+$/.test(path))
  let conditionalImage = null
  if (image) {
    await read(image, 'HEAD')
    const full = await read(image)
    const etag = full.response.headers.get('etag')
    if (etag) conditionalImage = (await read(image, 'GET', { 'If-None-Match': etag })).response.status === 304
  }
  const sitemap = await read('/sitemap.xml')
  await read('/member', 'HEAD')
  const test = await read('/blog/story-2026-71148cea')
  return { observedAt: new Date().toISOString(), kind: 'bounded-normal-http-audit-not-load-test', site: PREVIEW,
    requests: results.length, bytes: totalBytes, byteMeaning: 'decoded response bodies, not exact billable wire egress',
    limits: { maximumRequests: MAX_REQUESTS, maximumDecodedBytes: MAX_BYTES, concurrency: 1 },
    publishedPosts: snapshot.posts.length, conditionalImage,
    testCleanup: { absentFromList: !snapshot.posts.some(row => row.slug === 'story-2026-71148cea'), absentFromSitemap: !sitemap.body.includes('story-2026-71148cea'), article404: test.response.status === 404 },
    results }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await auditPublicTraffic()
    if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2), { flag: 'wx' })
    console.log(JSON.stringify(report, null, 2))
  } catch (error) {
    console.error('Normal traffic audit stopped: ' + (error.cause?.code || error.name || 'request failed') + '. No load test, configuration change or write request was made.')
    process.exitCode = 1
  }
}
