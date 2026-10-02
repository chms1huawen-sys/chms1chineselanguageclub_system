import test from 'node:test'
import assert from 'node:assert/strict'
import { uploadBlogPhoto } from '../src/utils/blogPhotoUpload.js'

test('display copies preserve original objects and their reference', async () => {
  const uploads = []
  const file = { type: 'image/jpeg' }
  const copy = { type: 'image/webp' }
  let sequence = 0
  const bucket = { upload: async (...args) => { uploads.push(args); return {} } }
  const row = await uploadBlogPhoto(bucket, file, 'post', 'jpg', async () => copy, () => String(++sequence))
  assert.deepEqual(row, { path: 'post/2.webp', original_path: 'post/1.jpg' })
  assert.equal(uploads[0][1], file)
  assert.equal(uploads[1][1], copy)
})

test('preview errors and failed copy uploads retain the usable original', async () => {
  for (const failure of ['decode', 'upload', 'not-smaller']) {
    let calls = 0
    const bucket = { upload: async () => (++calls === 2 ? { error: new Error('Offline') } : {}) }
    const preview = async () => {
      if (failure === 'decode') throw new Error('Unsupported image')
      return failure === 'not-smaller' ? null : {}
    }
    assert.deepEqual(await uploadBlogPhoto(bucket, { type: 'image/png' }, 'post', 'png', preview, () => 'photo'), { path: 'post/photo.png', original_path: null })
  }
})

test('original upload errors propagate without generating another object', async () => {
  let previewed = false
  await assert.rejects(uploadBlogPhoto({ upload: async () => ({ error: new Error('Upload failed') }) }, { type: 'image/jpeg' }, 'post', 'jpg', async () => { previewed = true }, () => 'photo'), /Upload failed/)
  assert.equal(previewed, false)
})
