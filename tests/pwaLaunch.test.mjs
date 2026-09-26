import assert from 'node:assert/strict'
import { memberLaunchUrl } from '../src/utils/pwaLaunch.js'

const root = 'https://club.example/'
assert.equal(memberLaunchUrl(root, true), root + '#/')
assert.equal(memberLaunchUrl(root, false), null)
for (const suffix of ['#/', '#/login', '#/tasks?id=123', '#access_token=test', '?code=test', '?app=blog', '?view=blog', '?tag=culture#articles', 'blog/story', 'blog-admin', 'activities']) {
  assert.equal(memberLaunchUrl(root + suffix, true), null, suffix)
}
console.log('Installed member launch, ordinary browser, explicit Blog visits and deep links passed.')
