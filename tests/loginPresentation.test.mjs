import test from 'node:test'
import assert from 'node:assert/strict'
import { LOGIN_DEFAULTS, loginPresentation, loginImagePath, loginPhotoLayout } from '../src/utils/loginPresentation.js'

test('login defaults and custom bilingual text retain exactly two slides', () => {
  assert.deepEqual(loginPresentation().slides.map(s => s.path), LOGIN_DEFAULTS.slides.map(s => s.path))
  const settings = loginPresentation({ title: 'Custom', footer: '', slides: [{ path: 'https://example.com/a.webp', title: 'New', title_en: 'English' }] })
  assert.equal(settings.title, 'Custom')
  assert.equal(settings.footer, '')
  assert.equal(settings.slides[0].title_en, 'English')
  assert.equal(settings.slides.length, 2)
  assert.equal(settings.slides[1].path, LOGIN_DEFAULTS.slides[1].path)
})
test('unsafe image URLs and malformed crops fall back safely', () => {
  for (const path of ['javascript:alert(1)', '//example.com/a.jpg', '/bad\\path', '/a/../b', 'https://user:pass@example.com/a.jpg', 'http://example.com/a.jpg']) assert.equal(loginImagePath(path), '')
  assert.equal(loginPresentation({ slides: [{ path: 'javascript:alert(1)', crop: { width: -1 } }] }).slides[0].path, LOGIN_DEFAULTS.slides[0].path)
  assert.equal(loginPresentation({ slides: [{ crop: { width: -1 } }] }).slides[0].crop, null)
})
test('crop layout covers different frames without stretching the source', () => {
  const crop = { x: 25, y: 25, width: 50, height: 50, naturalWidth: 1000, naturalHeight: 800 }
  for (const box of [{ width: 600, height: 800 }, { width: 600, height: 300 }]) {
    const layout = loginPhotoLayout(crop, box)
    assert.equal(layout.width / layout.height, 1.25)
    assert.ok(layout.width * .5 >= box.width)
    assert.ok(layout.height * .5 >= box.height)
  }
  assert.equal(loginPhotoLayout(null, { width: 100, height: 100 }), null)
})
