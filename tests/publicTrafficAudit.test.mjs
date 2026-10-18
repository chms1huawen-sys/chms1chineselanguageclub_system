import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditPublicTraffic, checkPreviewResponse } from '../scripts/audit-public-traffic.mjs'

test('traffic audit is sequential, bounded, read-only and never follows a redirect', async () => {
  const calls = []
  const report = await auditPublicTraffic(async (url, options) => {
    calls.push({ url, ...options })
    assert.ok(['GET', 'HEAD'].includes(options.method))
    assert.equal(options.redirect, 'manual')
    assert.equal(new URL(url).origin, 'https://chms1clc-public-preview.chms1chineselanguageclub-system.workers.dev')
    const path = new URL(url).pathname
    const headers = { 'X-Robots-Tag': 'noindex, nofollow' }
    if (path === '/api/blog-public') return Response.json({ posts: [{ slug: 'one', status: 'published' }], settings: {}, media: [{ path: '/public-media/blog-photos/one/display.webp' }] }, { headers })
    if (path.startsWith('/public-media/')) return new Response(options.headers['If-None-Match'] || options.method === 'HEAD' ? null : 'image', { status: options.headers['If-None-Match'] ? 304 : 200, headers: { ...headers, ETag: '"one"', 'Content-Type': 'image/webp' } })
    if (path === '/member' || path === '/blog-admin') return new Response(null, { status: 302, headers: { ...headers, Location: 'https://chms1chineselanguageclubsystem.vercel.app' + path } })
    if (path === '/blog/story-2026-71148cea') return new Response('', { status: 404, headers })
    if (path === '/sitemap.xml') return new Response('<urlset><url><loc>https://chms1chineselanguageclubsystem.vercel.app/literature</loc></url></urlset>', { headers })
    return new Response('<html>Public content</html>', { headers })
  })
  assert.equal(report.requests, 16)
  assert.equal(report.passed, true)
  assert.ok(report.requests <= report.limits.maximumRequests)
  assert.equal(report.conditionalImage, true)
  assert.deepEqual(report.testCleanup, { absentFromList: true, absentFromSitemap: true, article404: true })
  assert.equal(calls.length, report.requests)
})

test('preflight rejects false successes, wrong private redirects and exposed preview indexing', () => {
  assert.ok(checkPreviewResponse('/', new Response('Unavailable', { status: 503 }), 'Unavailable').length)
  assert.ok(checkPreviewResponse('/member', new Response(null, { status: 302, headers: { 'X-Robots-Tag': 'noindex', Location: 'https://other.example/member' } }), '').length)
  assert.ok(checkPreviewResponse('/sitemap.xml', new Response('', { headers: { 'X-Robots-Tag': 'noindex' } }), '<urlset><loc>https://preview.workers.dev/member</loc></urlset>').length)
  assert.ok(checkPreviewResponse('/public-media/blog-photos/a.webp', new Response(null, { status: 302, headers: { 'X-Robots-Tag': 'noindex', Location: 'https://other.example/photo' } }), '').length)
})

test('traffic audit stops on the first unavailable source instead of repeating network attempts', async () => {
  let calls = 0
  await assert.rejects(auditPublicTraffic(async () => { calls++; throw new Error('offline') }), /offline/)
  assert.equal(calls, 1)
})
