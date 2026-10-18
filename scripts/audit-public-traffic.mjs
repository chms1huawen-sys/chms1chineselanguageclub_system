import process from 'node:process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { writeFile } from 'node:fs/promises'

const PREVIEW = 'https://chms1clc-public-preview.chms1chineselanguageclub-system.workers.dev'
const MAX_REQUESTS = 16
const MAX_BYTES = 3 * 1024 * 1024
const SOURCE = 'https://chms1chineselanguageclubsystem.vercel.app'

export function checkPreviewResponse(path, response, body) {
  const errors = []
  if (!/\bnoindex\b/i.test(response.headers.get('x-robots-tag') || '')) errors.push('Preview indexing protection missing')
  const location = response.headers.get('location')
  if (path === '/member' || path === '/blog-admin') {
    if (response.status !== 302 || location !== SOURCE + path) errors.push('Private entry must redirect to its original Vercel path')
  } else if (path === '/blog/story-2026-71148cea') {
    if (response.status !== 404) errors.push('Withdrawn test article is still available')
  } else if (path.startsWith('/public-media/') && response.status === 302) {
    let target
    try { target = new URL(location) } catch { /* Invalid redirect is reported below. */ }
    if (target?.origin !== SOURCE || target?.pathname !== '/api/blog-media') errors.push('Image fallback points outside the authorized gateway')
  } else if (response.status !== 200 && !(path.startsWith('/public-media/') && response.status === 304)) {
    errors.push(`Unexpected HTTP ${response.status}`)
  }
  if (path === '/sitemap.xml') {
    if (!body.includes('<urlset') || !body.includes(`<loc>${SOURCE}/literature</loc>`)) errors.push('Preview sitemap does not describe the current source site')
    if (/<loc>[^<]*(?:\/member|\/blog-admin|#\/)/i.test(body)) errors.push('Private route in sitemap')
    if (body.includes('.workers.dev')) errors.push('Preview host is advertised in sitemap')
  }
  return errors
}

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
      contentType: response.headers.get('content-type'), redirectOrigin: response.headers.get('location') ? new URL(response.headers.get('location'), PREVIEW).origin : null,
      errors: checkPreviewResponse(path, response, body) })
    return { response, body }
  }
  const first = await read('/api/blog-public')
  if (first.response.status !== 200) throw new Error('Public snapshot unavailable; audit stopped')
  const snapshot = JSON.parse(first.body)
  if (!Array.isArray(snapshot.posts) || snapshot.posts.some(post => post.status !== 'published')) throw new Error('Invalid public source; audit stopped')
  for (const path of ['/', '/literature', '/activities', '/bookroom', '/news', '/about']) await read(path)
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
  await read('/blog-admin', 'HEAD')
  await read('/robots.txt')
  const test = await read('/blog/story-2026-71148cea')
  const testCleanup = { absentFromList: !snapshot.posts.some(row => row.slug === 'story-2026-71148cea'), absentFromSitemap: !sitemap.body.includes('story-2026-71148cea'), article404: test.response.status === 404 }
  return { observedAt: new Date().toISOString(), kind: 'bounded-normal-http-audit-not-load-test', site: PREVIEW,
    requests: results.length, bytes: totalBytes, byteMeaning: 'decoded response bodies, not exact billable wire egress',
    limits: { maximumRequests: MAX_REQUESTS, maximumDecodedBytes: MAX_BYTES, concurrency: 1 },
    passed: results.every(result => result.errors.length === 0) && conditionalImage !== false && Object.values(testCleanup).every(Boolean),
    publishedPosts: snapshot.posts.length, conditionalImage,
    testCleanup,
    results }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const report = await auditPublicTraffic()
    if (process.argv[2]) await writeFile(resolve(process.argv[2]), JSON.stringify(report, null, 2), { flag: 'wx' })
    console.log(JSON.stringify(report, null, 2))
    if (!report.passed) process.exitCode = 1
  } catch (error) {
    console.error('Normal traffic audit stopped: ' + (error.cause?.code || error.name || 'request failed') + '. No load test, configuration change or write request was made.')
    process.exitCode = 1
  }
}
