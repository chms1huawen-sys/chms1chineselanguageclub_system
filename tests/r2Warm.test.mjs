import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { validateWarmPlan, warmPhoto } from '../scripts/warm-r2-photos.mjs'

const file = { bucket: 'blog-photos', path: 'post/image.webp', targetKey: 'photos-v1/blog-photos/post/image.webp', bytes: 4, contentType: 'image/webp' }
const plan = { schemaVersion: 1, blocked: [], files: [file], totals: { files: 1, bytes: 4 } }
test('prewarm rejects duplicate, unsafe, over-budget and incomplete plans', () => {
  assert.equal(validateWarmPlan(plan, 'https://site.example'), 'https://site.example')
  for (const invalid of [
    { ...plan, blocked: ['bad'] }, { ...plan, totals: { files: 2, bytes: 4 } },
    { ...plan, files: [file, file], totals: { files: 2, bytes: 8 } },
    { ...plan, files: [{ ...file, bucket: 'finance-receipts' }] },
    { ...plan, files: [{ ...file, bytes: 40 * 1024 * 1024 }], totals: { files: 1, bytes: 40 * 1024 * 1024 } },
  ]) assert.throws(() => validateWarmPlan(invalid, 'https://site.example'))
  assert.throws(() => validateWarmPlan(plan, 'http://site.example'))
})

test('prewarm verifies R2 size, type and SHA-256 without logging signed URLs', async () => {
  const sha256 = createHash('sha256').update('data').digest('hex')
  let calls = 0
  const result = await warmPhoto(file, 'https://site.example', async url => {
    calls++
    if (calls === 1) {
      assert.equal(new URL(url).searchParams.get('bucket'), 'blog-photos')
      return Response.json({ provider: 'r2', verification: { sha256, bytes: 4, contentType: 'image/webp' }, data: { signedUrl: 'https://bucket.account.r2.cloudflarestorage.com/photos?secret=signature' } })
    }
    return new Response('data', { headers: { 'content-length': '4', 'content-type': 'image/webp' } })
  })
  assert.deepEqual(result, { targetKey: file.targetKey, bytes: 4, sha256, status: 'verified' })
  assert.ok(!JSON.stringify(result).includes('secret'))
  await assert.rejects(warmPhoto(file, 'https://site.example', async () => Response.json({ provider: 'supabase' })), /not active/)
})
