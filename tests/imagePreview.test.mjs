import test from 'node:test'
import assert from 'node:assert/strict'
import { previewDimensions, createImagePreview } from '../src/utils/imagePreview.js'

test('preview preserves aspect ratio and never enlarges small photos', () => {
  assert.deepEqual(previewDimensions(6000, 4000), { width: 1920, height: 1280 })
  assert.deepEqual(previewDimensions(4000, 6000), { width: 1280, height: 1920 })
  assert.deepEqual(previewDimensions(600, 400), { width: 600, height: 400 })
  assert.throws(() => previewDimensions(0, 400))
})

test('preview selects only smaller WebP output and releases decoded images', async t => {
  let closed = 0
  let blob = new Blob(['small'], { type: 'image/webp' })
  const originalBitmap = Object.getOwnPropertyDescriptor(globalThis, 'createImageBitmap')
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  t.after(() => {
    if (originalBitmap) Object.defineProperty(globalThis, 'createImageBitmap', originalBitmap)
    else delete globalThis.createImageBitmap
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else delete globalThis.document
  })
  globalThis.createImageBitmap = async () => ({ width: 6000, height: 4000, close: () => closed++ })
  globalThis.document = { createElement: () => ({
    getContext: () => ({ drawImage() {} }), toBlob: done => done(blob),
  }) }
  assert.equal(await createImagePreview({ size: 100 }), blob)
  assert.equal(await createImagePreview({ size: 1 }), null)
  blob = new Blob(['png'], { type: 'image/png' })
  assert.equal(await createImagePreview({ size: 100 }), null)
  assert.equal(closed, 3)
})
