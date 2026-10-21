import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runtimeReferences, checkRuntimeAssets } from '../scripts/check-runtime-assets.mjs'
import { checkPage } from '../scripts/check-production.mjs'
import { versionedSnapshotSource } from '../server/publicSnapshot.js'
import { createCmsHandler } from '../cloudflare/public-preview/cms.js'

test('runtime check follows entry, preload, lazy modules and CSS without leaving the origin', () => {
  assert.deepEqual(runtimeReferences('import "./next-A.js"; const lazy="assets/Lazy-B.js"; const css="/assets/app-C.css"; const evil="https://evil.test/a.js"', 'https://chms1clc.org/assets/app.js'), [
    'https://chms1clc.org/assets/next-A.js', 'https://chms1clc.org/assets/Lazy-B.js', 'https://chms1clc.org/assets/app-C.css',
  ])
})

test('HTTP 200 HTML alone cannot pass when its module is missing', async () => {
  const result = await checkRuntimeAssets('https://chms1clc.org', '/', async url => new Response(url.endsWith('/') ? '<script src="/assets/app.js"></script>' : 'Missing', { status: url.endsWith('/') ? 200 : 404, headers: { 'content-type': 'text/html' } }))
  assert.equal(result.checked, 2)
  assert.equal(result.errors[0].status, 404)
})

test('public member entries redirect to the source; source entries must render the app', () => {
  const headers = { 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'content-security-policy': "default-src 'self'", 'strict-transport-security': 'max-age=31536000', 'x-robots-tag': 'noindex, nofollow' }
  for (const path of ['/member', '/blog-admin']) {
    const response = new Response(null, { status: 302, headers: { ...headers, location: 'https://chms1chineselanguageclubsystem.vercel.app' + path } })
    assert.deepEqual(checkPage(path, response, '', 'https://chms1clc.org'), [])
    assert.ok(checkPage(path, response, '', 'https://chms1chineselanguageclubsystem.vercel.app').length)
  }
})

test('a new runtime rebuilds the public snapshot even when articles did not change', async () => {
  let checks = 0
  const source = versionedSnapshotSource({ checkDue: async () => { checks++; return false }, build: async now => ({ generatedAt: now, posts: ['unchanged'] }) }, 'new-runtime')
  assert.equal(await source.checkDue({ runtimeVersion: 'old-runtime' }), true)
  assert.equal(checks, 0)
  assert.equal(await source.checkDue({ runtimeVersion: 'new-runtime' }), false)
  assert.deepEqual(await source.build(123), { generatedAt: 123, posts: ['unchanged'], runtimeVersion: 'new-runtime' })
})

test('CMS distinguishes unsupported methods from an unavailable service', async () => {
  const response = await createCmsHandler()(new Request('https://chms1clc.org/api/blog-admin'), { CMS: {} })
  assert.equal(response.status, 405)
  assert.equal((await response.json()).error, 'METHOD_NOT_ALLOWED')
})
