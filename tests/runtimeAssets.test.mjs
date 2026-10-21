import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runtimeReferences, checkRuntimeAssets } from '../scripts/check-runtime-assets.mjs'

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
