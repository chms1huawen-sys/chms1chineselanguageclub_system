import assert from 'node:assert/strict'
import { memberLaunchUrl } from '../src/utils/pwaLaunch.js'

const root = 'https://club.example/'
assert.equal(memberLaunchUrl(root, true), root + 'member#/')
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
