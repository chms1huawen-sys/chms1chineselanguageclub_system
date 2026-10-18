import assert from 'node:assert/strict'
import { memberLaunchUrl, prepareAppLaunch, isPublicPreview } from '../src/utils/pwaLaunch.js'
import { readFileSync } from 'node:fs'

const root = 'https://club.example/'
assert.equal(memberLaunchUrl(root, true), null)
assert.equal(memberLaunchUrl(root, false), null)
for (const suffix of ['#access_token=test', '?code=test', '?app=blog', '?view=blog', '?tag=culture#articles', 'blog/story', 'blog-admin', 'activities']) {
  assert.equal(memberLaunchUrl(root + suffix, true), null, suffix)
}
for (const suffix of ['#/', '#/login', '#/tasks?id=123']) {
  assert.equal(memberLaunchUrl(root + suffix, false), root + 'member' + suffix)
}
assert.equal(memberLaunchUrl(root + 'member', false), root + 'member#/')
assert.equal(memberLaunchUrl(root + 'member#/tasks', false), null)
console.log('Installed member launch, ordinary browser, explicit Blog visits and deep links passed.')

for (const preview of [true, false]) for (const suffix of ['', '#/login?return=%2Fabout', '?app=blog']) {
  const url = new URL(root + suffix)
  const events = []
  const doc = { querySelector: selector => selector.startsWith('meta') ? preview ? {} : null : {
    remove: () => events.push('remove-manifest'), setAttribute: (_name, value) => events.push(value),
  } }
  const browser = { location: { href: url.href, search: url.search, replace: value => events.push(value) }, history: { replaceState: (_state, _title, value) => events.push(value) } }
  assert.equal(isPublicPreview(doc), preview)
  prepareAppLaunch(browser, doc)
  if (preview) {
    assert.equal(events[0], 'remove-manifest')
    if (suffix.startsWith('#/')) assert.equal(events[1], 'https://chms1chineselanguageclubsystem.vercel.app/member' + suffix)
    else assert.equal(events.length, 1)
  } else if (suffix === '?app=blog') assert.deepEqual(events, ['/manifest-blog.json'])
}
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8')
assert.match(main, /'serviceWorker' in navigator && !isPublicPreview\(\)/)
