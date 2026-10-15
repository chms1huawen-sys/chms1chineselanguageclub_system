import { test } from 'node:test'
import assert from 'node:assert/strict'
import { photoCandidates, buildPhotoPlan } from '../scripts/lib/r2-photo-plan.mjs'
import { readPages } from '../scripts/prepare-r2-photos.mjs'

const input = {
  projectUrl: 'https://example.supabase.co',
  posts: [{ id: 'published', status: 'published', cover_path: 'published/original.jpg' }, { id: 'draft', status: 'draft', cover_path: 'draft/private.jpg' }],
  albums: [{ id: 'album', status: 'published', cover_path: '' }],
  media: [
    { post_id: 'published', path: 'published/original.jpg', display_path: 'published/display.webp' },
    { post_id: 'draft', path: 'draft/private.jpg' },
    { album_id: 'album', path: 'album/photo.png' },
    { post_id: 'hidden', path: 'hidden/photo.png' },
  ],
  settings: { hero_path: 'https://example.supabase.co/storage/v1/object/public/blog-site-media/site/banner.webp', private: 'https://example.supabase.co/storage/v1/object/sign/finance-receipts/receipt.png', external: 'https://other.supabase.co/storage/v1/object/public/blog-site-media/site/other.jpg' },
}

test('plan uses compressed display photos and excludes drafts, originals, private buckets and external hosts', () => {
  const result = photoCandidates(input)
  assert.equal(result.optimizedPhotos, 1)
  assert.deepEqual(result.candidates.map(row => `${row.bucket}/${row.path}`), ['blog-photos/album/photo.png', 'blog-photos/published/display.webp', 'blog-site-media/site/banner.webp'])
})
test('plan blocks missing files and unexpected MIME types, and totals only verified metadata', () => {
  const objects = [
    { bucket: 'blog-photos', path: 'published/display.webp', metadata: { size: 1000, mimetype: 'image/webp' } },
    { bucket: 'blog-photos', path: 'album/photo.png', metadata: { size: 500, mimetype: 'text/html' } },
  ]
  const plan = buildPhotoPlan(input, objects, new Date('2026-10-15T00:00:00Z'))
  assert.equal(plan.totals.bytes, 1000)
  assert.equal(plan.totals.files, 1)
  assert.equal(plan.totals.blocked, 2)
  assert.equal(plan.mode, 'metadata-only')
})
test('unsafe paths are never included', () => {
  const result = photoCandidates({ ...input, posts: [], albums: [], media: [], settings: ['site/unused.webp', 'https://example.supabase.co/storage/v1/object/public/blog-site-media/a/%2E%2E/secret.jpg'] })
  assert.equal(result.candidates.length, 0)
})
test('metadata pagination does not silently stop at an API page limit', async () => {
  const rows = await readPages(() => ({ range: async start => ({ data: Array.from({ length: start === 0 ? 500 : 1 }, (_, index) => ({ id: start + index })) }) }))
  assert.equal(rows.length, 501)
  await assert.rejects(readPages(() => ({ range: async () => ({ error: true }) })), /metadata/)
})
