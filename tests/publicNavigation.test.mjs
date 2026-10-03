import test from 'node:test'
import assert from 'node:assert/strict'
import { navigatePublicLink } from '../src/utils/publicNavigation.js'

function navigation(href, options = {}) {
  const location = { origin: 'https://club.example', pathname: '/', search: '', hash: '#/members' }
  const pushes = []
  const browserWindow = { location, history: { pushState: (_state, _title, path) => pushes.push(path) } }
  let prevented = false
  const link = { href, target: options.target || '', hasAttribute: name => name === 'download' && !!options.download }
  const event = { button: 0, target: { closest: () => link }, preventDefault: () => { prevented = true }, ...options }
  return { handled: navigatePublicLink(event, browserWindow), prevented, pushes }
}

test('member home link clears hash with one soft navigation, including installed PWA', () => {
  for (const path of ['/', '/?view=blog']) {
    assert.deepEqual(navigation(path), { handled: true, prevented: true, pushes: [path] })
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
