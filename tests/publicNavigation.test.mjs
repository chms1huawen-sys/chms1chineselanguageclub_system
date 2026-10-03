import test from 'node:test'
import assert from 'node:assert/strict'
import { navigateMemberLink, navigatePublicLink, memberNavigationTarget } from '../src/utils/publicNavigation.js'

function navigation(href, options = {}, navigate = navigatePublicLink, current = {}) {
  const location = { origin: 'https://club.example', pathname: '/', search: '', hash: '#/members', ...current }
  const pushes = []
  const browserWindow = { location, history: { pushState: (_state, _title, path) => pushes.push(path) } }
  let prevented = false
  const link = { href, target: options.target || '', hasAttribute: name => name === 'download' && !!options.download }
  const event = { button: 0, target: { closest: () => link }, preventDefault: () => { prevented = true }, ...options }
  return { handled: navigate(event, browserWindow), prevented, pushes }
}

test('member home link clears hash with one soft navigation, including installed PWA', () => {
  for (const path of ['/', '/?view=blog']) {
    assert.deepEqual(navigation(path), { handled: true, prevented: true, pushes: [path] })
  }
})

test('website and PWA home can enter members without a document reload', () => {
  for (const current of [{ pathname: '/blog/story', hash: '' }, { search: '?view=blog', hash: '' }, { hash: '' }]) {
    assert.deepEqual(navigation('/#/', {}, navigateMemberLink, current), { handled: true, prevented: true, pushes: ['/#/'] })
  }
  const login = '/#/login?return=%2Fblog%2Fstory'
  assert.deepEqual(navigation(login, {}, navigateMemberLink, { hash: '' }), { handled: true, prevented: true, pushes: [login] })
})

test('member navigation is limited to same-origin root and login entry links', () => {
  for (const path of ['/#/tasks', '/#/members', '/blog-admin', '/?app=blog#/', '/blog/story#/', 'https://other.example/#/', '/#blog-content']) {
    assert.equal(memberNavigationTarget(path, 'https://club.example'), null, path)
    assert.deepEqual(navigation(path, {}, navigateMemberLink), { handled: false, prevented: false, pushes: [] })
  }
})

test('member entry respects new tabs, downloads and modified clicks', () => {
  for (const options of [{ target: '_blank' }, { download: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    assert.deepEqual(navigation('/#/', options, navigateMemberLink), { handled: false, prevented: false, pushes: [] })
  }
})

test('private routes, explicit installed app launches and external links keep native navigation', () => {
  for (const path of ['/#/members', '/blog-admin', '/?app=blog', 'https://other.example/']) {
    assert.deepEqual(navigation(path), { handled: false, prevented: false, pushes: [] })
  }
})

test('new tabs, downloads, modified clicks and already handled clicks are untouched', () => {
  for (const options of [{ target: '_blank' }, { download: true }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { defaultPrevented: true }]) {
    assert.deepEqual(navigation('/', options), { handled: false, prevented: false, pushes: [] })
  }
})
