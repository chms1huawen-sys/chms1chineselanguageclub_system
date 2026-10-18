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

test('direct R2 uploads use returned paths and keep a separate public copy even for small images',async()=>{
  const owner='10000000-0000-4000-8000-000000000001'
  const original=owner+'/r2-20000000-0000-4000-8000-000000000001.jpg'
  const display=owner+'/r2-30000000-0000-4000-8000-000000000001.jpg'
  let count=0
  const bucket={upload:async()=>({data:{path:++count===1?original:display}})}
  assert.deepEqual(await uploadBlogPhoto(bucket,{type:'image/jpeg'},owner,'jpg',async()=>null),{path:display,original_path:original})
  const removed=[]
  await assert.rejects(uploadBlogPhoto({upload:async()=>({data:{path:original}}),remove:async paths=>removed.push(...paths)},{type:'image/jpeg'},owner,'jpg',async()=>{throw new Error('Decode failed')}),/Original photos were not published/)
  assert.deepEqual(removed,[original])
})
