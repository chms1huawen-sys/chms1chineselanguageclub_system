import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditPublicTraffic } from '../scripts/audit-public-traffic.mjs'

test('traffic audit is sequential, bounded, read-only and never follows a redirect', async () => {
  const calls = []
  const report = await auditPublicTraffic(async (url, options) => {
    calls.push({ url, ...options })
    assert.ok(['GET', 'HEAD'].includes(options.method))
    assert.equal(options.redirect, 'manual')
    assert.equal(new URL(url).origin, 'https://chms1clc-public-preview.chms1chineselanguageclub-system.workers.dev')
    const path = new URL(url).pathname
    if (path === '/api/blog-public') return Response.json({ posts: [{ slug: 'one', status: 'published' }], settings: {}, media: [{ path: '/public-media/blog-photos/one/display.webp' }] })
    if (path.startsWith('/public-media/')) return new Response(options.headers['If-None-Match'] || options.method === 'HEAD' ? null : 'image', { status: options.headers['If-None-Match'] ? 304 : 200, headers: { ETag: '"one"', 'Content-Type': 'image/webp' } })
    if (path === '/member') return new Response(null, { status: 302, headers: { Location: 'https://chms1chineselanguageclubsystem.vercel.app/member' } })
    if (path === '/blog/story-2026-71148cea') return new Response('', { status: 404 })
    return new Response('<html>Public content</html>')
  })
  assert.equal(report.requests, 12)
  assert.ok(report.requests <= report.limits.maximumRequests)
  assert.equal(report.conditionalImage, true)
  assert.deepEqual(report.testCleanup, { absentFromList: true, absentFromSitemap: true, article404: true })
  assert.equal(calls.length, report.requests)
})

test('traffic audit stops on the first unavailable source instead of repeating network attempts', async () => {
  let calls = 0
  await assert.rejects(auditPublicTraffic(async () => { calls++; throw new Error('offline') }), /offline/)
  assert.equal(calls, 1)
})
