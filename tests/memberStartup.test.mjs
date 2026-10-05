import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { withPublicStyles } from '../server/publicStyles.js'
import { memberNavigationTarget } from '../src/utils/publicNavigation.js'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('early launch changes only member URLs, without another document request', () => {
  for (const [path, installed, expected] of [
    ['/#/login?return=%2Fliterature', false, '/member#/login?return=%2Fliterature'],
    ['/#/tasks?id=123', false, '/member#/tasks?id=123'],
    ['/member', false, '/member#/'], ['/member/', false, '/member#/'],
    ['/', true, '/member#/'], ['/', false, null], ['/?app=blog', true, null],
    ['/?view=blog', true, null], ['/#access_token=test', false, null],
  ]) {
    let replacement = null
    vm.runInNewContext(read('public/app-launch.js'), {
      URL, window: { location: { href: 'https://club.example' + path }, navigator: {}, matchMedia: () => ({ matches: installed }),
        history: { replaceState: (_state, _title, value) => { replacement = value } } },
      document: { documentElement: { setAttribute() {} } },
    })
    assert.equal(replacement, expected === null ? null : 'https://club.example' + expected, path)
  }
  for (const link of ['/member#/', '/member#/login?return=%2Fabout']) assert.equal(memberNavigationTarget(link, 'https://club.example'), link)
})

test('public renderer styles are available before JavaScript without burdening member entry', () => {
  const manifest = JSON.parse(read('dist/.vite/manifest.json'))
  const template = read('dist/index.html')
  const publicTemplate = withPublicStyles(template, manifest)
  assert.match(publicTemplate, /href="\/assets\/Blog-[^"]+\.css"/)
  assert.doesNotMatch(template, /href="\/assets\/Blog-[^"]+\.css"/)
  assert.equal(withPublicStyles(publicTemplate, manifest), publicTemplate)
  const visited = new Set()
  const traverse = key => {
    if (visited.has(key)) return
    visited.add(key)
    for (const dependency of manifest[key]?.imports || []) traverse(dependency)
  }
  traverse('index.html')
  assert.ok(!visited.has('src/pages/Blog.jsx'))
  for (const key of visited) assert.notEqual(manifest[key]?.name, 'Blog')
})

test('member PWA keeps identity and notification clicks support legacy and new routes', async () => {
  const manifest = JSON.parse(read('public/manifest.json'))
  assert.equal(manifest.id, '/')
  assert.equal(manifest.start_url, '/member#/')
  assert.equal(manifest.scope, '/')
  assert.equal(JSON.parse(read('public/manifest-blog.json')).start_url, '/?app=blog')
  const listeners = {}
  let navigated
  vm.runInNewContext(read('public/firebase-messaging-sw.js'), {
    importScripts() {}, firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage() {} }) },
    self: { addEventListener: (name, handler) => { listeners[name] = handler } },
    clients: { matchAll: async () => [], openWindow: async url => { navigated = url } },
  })
  for (const [url, expected] of [['/', '/member#/'], ['/tasks', '/member#/tasks'], ['/#/inventory', '/member#/inventory'], ['/member#/calendar', '/member#/calendar'], ['/blog/story', '/blog/story']]) {
    let pending
    listeners.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: promise => { pending = promise } })
    await pending
    assert.equal(navigated, expected)
  }
})
