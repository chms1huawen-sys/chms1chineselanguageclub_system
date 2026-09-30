import test from 'node:test'
import assert from 'node:assert/strict'
import { createSignedImageCache } from '../src/utils/signedImageCache.js'
import { fetchWithRetry } from '../supabase/functions/send-push-notification/retry.js'

test('signed image requests share a pending result and expire before the signed URL', async () => {
  let time = 0, calls = 0
  const sign = createSignedImageCache(async () => ({ data: { signedUrl: `url-${++calls}` } }), () => time)
  const results = await Promise.all([sign('a'), sign('a')])
  assert.equal(calls, 1)
  assert.equal(results[0], results[1])
  time = 51 * 60 * 1000
  await sign('a')
  assert.equal(calls, 2)
})

test('failed signing does not poison later attempts', async () => {
  let calls = 0
  const sign = createSignedImageCache(async () => ++calls === 1 ? { error: new Error('Offline') } : { data: { signedUrl: 'ok' } })
  await assert.rejects(sign('a'), /Offline/)
  assert.equal((await sign('a')).data.signedUrl, 'ok')
})

test('transient rejection retries, permanent rejection and ambiguous network errors do not', async () => {
  let calls = 0
  const delays = []
  const response = await fetchWithRetry('url', {}, async () => new Response('', { status: ++calls < 3 ? 503 : 200 }), async ms => delays.push(ms))
  assert.equal(response.status, 200)
  assert.equal(calls, 3)
  assert.deepEqual(delays, [1000, 2000])
  calls = 0
  await fetchWithRetry('url', {}, async () => { calls++; return new Response('', { status: 400 }) })
  assert.equal(calls, 1)
  calls = 0
  await assert.rejects(fetchWithRetry('url', {}, async () => { calls++; throw new Error('Offline') }), /Offline/)
  assert.equal(calls, 1)
})

test('retry cap and long Retry-After are respected', async () => {
  let calls = 0
  const result = await fetchWithRetry('url', {}, async () => { calls++; return new Response('', { status: 503 }) }, async () => {})
  assert.equal(result.status, 503)
  assert.equal(calls, 3)
  calls = 0
  await fetchWithRetry('url', {}, async () => { calls++; return new Response('', { status: 429, headers: { 'Retry-After': '60' } }) })
  assert.equal(calls, 1)
})
