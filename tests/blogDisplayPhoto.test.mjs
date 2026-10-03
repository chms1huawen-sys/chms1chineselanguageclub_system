import test from 'node:test'
import assert from 'node:assert/strict'
import { displayPhotoPath } from '../src/utils/blogDisplayPhoto.js'

function db(result) {
  const query = { select: () => query, eq: () => query, not: () => query, limit: () => query, maybeSingle: async () => result }
  return { from: () => query }
}
test('uses the smaller copy without changing the source reference', async () => {
  assert.equal(await displayPhotoPath(db({ data: { display_path: 'small.webp' } }), 'original.jpg'), 'small.webp')
})
test('old schema, private media and missing copies fall back to the original', async () => {
  for (const result of [{ error: new Error('missing column') }, { data: null }, { data: { display_path: null } }]) {
    assert.equal(await displayPhotoPath(db(result), 'original.jpg'), 'original.jpg')
  }
  assert.equal(await displayPhotoPath({ from() { throw new Error('offline') } }, 'original.jpg'), 'original.jpg')
})
