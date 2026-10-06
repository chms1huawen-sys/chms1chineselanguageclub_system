import test from 'node:test'
import assert from 'node:assert/strict'
import { publicPageRequest } from '../server/publicRequest.js'
import { checkPage, checkProduction } from '../scripts/check-production.mjs'

test('public request rejects repeated, oversized and control-character parameters', () => {
  assert.deepEqual(publicPageRequest({ q: '  诗歌  ', view: 'blog' }), { slug: '', view: 'home', search: '诗歌' })
  for (const query of [{ q: ['a', 'b'] }, { slug: {} }, { view: null }, { q: 'a'.repeat(201) }, { slug: 'a\n' }]) {
    assert.throws(() => publicPageRequest(query), TypeError)
  }
  assert.equal(publicPageRequest({ view: 'literature', q: 'poetry' }).search, '')
})

const headers = new Headers({
  'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'self'", 'strict-transport-security': 'max-age=31536000',
  'x-robots-tag': 'noindex, nofollow',
})
test('production checks detect security and SEO regressions without credentials', async () => {
  assert.deepEqual(checkPage('/member', { status: 200, headers }, '<script src="/app-launch.js"></script>', 'https://club.example'), [])
  assert.ok(checkPage('/member', { status: 200, headers: new Headers() }, '', 'https://club.example').length >= 5)
  assert.ok(checkPage('/sitemap.xml', { status: 200, headers }, '<urlset><loc>https://club.example/member</loc></urlset>', 'https://club.example').includes('Private entry in sitemap'))
  await assert.rejects(checkProduction('https://secret@club.example'), /without credentials/)
  const results = await checkProduction('https://club.example', async (_url, options) => {
    assert.equal(options.redirect, 'error')
    throw new Error('Failure with private details')
  })
  assert.equal(results.length, 5)
  assert.equal(JSON.stringify(results).includes('private details'), false)
})
