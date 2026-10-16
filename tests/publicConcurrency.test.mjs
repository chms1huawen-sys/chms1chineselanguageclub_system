import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testPublicConcurrency } from '../scripts/test-public-concurrency.mjs'

test('bounded stages never exceed five parallel read-only requests or follow redirects', async () => {
  let calls = 0
  const report = await testPublicConcurrency({ batches: 2, sleep: async () => {}, request: async (url, options) => {
    calls++
    assert.equal(new URL(url).origin, 'https://chms1clc-public-preview.chms1chineselanguageclub-system.workers.dev')
    assert.equal(new URL(url).search, '')
    assert.ok(!url.includes('/member') && !url.includes('refresh='))
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'manual')
    return new Response('public', { headers: { 'x-public-preview-version': 'revision' } })
  } })
  assert.equal(calls, 16)
  assert.equal(report.peakConcurrency, 5)
  assert.equal(report.stopped, null)
  assert.equal(report.bytes, 16 * 6)
})

test('rate limits and redirects stop the test immediately without contacting the destination', async () => {
  for (const status of [302, 402, 429, 500]) {
    let calls = 0
    const report = await testPublicConcurrency({ sleep: async () => {}, request: async () => { calls++; return new Response(null, { status }) } })
    assert.equal(calls, 1)
    assert.equal(report.stopped, 'unexpected-response-' + status)
  }
})

test('oversized bodies and network errors stop before the next batch', async () => {
  const large = await testPublicConcurrency({ sleep: async () => {}, request: async () => new Response(new Uint8Array(600 * 1024), { headers: { 'x-public-preview-version': 'revision' } }) })
  assert.equal(large.stopped, 'response-size-limit')
  assert.equal(large.requests, 1)
  const offline = await testPublicConcurrency({ sleep: async () => {}, request: async () => { throw new Error('offline') } })
  assert.equal(offline.stopped, 'network-error-or-timeout')
  assert.equal(offline.requests, 1)
})
