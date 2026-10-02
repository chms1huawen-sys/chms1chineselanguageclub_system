import test from 'node:test'
import assert from 'node:assert/strict'
import { requestWhenVisible } from '../src/utils/lazyImageRequest.js'

test('offscreen pictures do not request a signed URL, and visible pictures request once', () => {
  let callback, requested = 0, disconnected = 0
  const element = {}
  class Observer {
    constructor(cb, options) { callback = cb; assert.equal(options.rootMargin, '200px') }
    observe(target) { assert.equal(target, element) }
    disconnect() { disconnected++ }
  }
  const stop = requestWhenVisible(element, () => requested++, Observer)
  assert.equal(requested, 0)
  callback([{ isIntersecting: false }])
  assert.equal(requested, 0)
  callback([{ isIntersecting: true }])
  callback([{ isIntersecting: true }])
  assert.equal(requested, 1)
  stop()
  assert.equal(disconnected, 2)
})

test('unmounted pictures do not start requests; unsupported browsers still load', () => {
  let callback, requested = 0
  class Observer {
    constructor(cb) { callback = cb }
    observe() {}
    disconnect() {}
  }
  requestWhenVisible({}, () => requested++, Observer)()
  callback([{ isIntersecting: true }])
  assert.equal(requested, 0)
  requestWhenVisible({}, () => requested++, null)
  assert.equal(requested, 1)
})
