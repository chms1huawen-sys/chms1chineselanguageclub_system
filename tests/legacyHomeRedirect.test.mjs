import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { PUBLIC_ORIGIN, SOURCE_ORIGIN } from '../src/utils/siteOrigins.js'
import { publicSitemapPaths } from '../api/sitemap.js'

const script = readFileSync(new URL('../public/home-redirect.js', import.meta.url), 'utf8')
function redirect(suffix) {
  const destinations = []
  runInNewContext(script, { URL, URLSearchParams, window: {
    location: { href: SOURCE_ORIGIN + '/' + suffix, replace: value => destinations.push(value) },
  } })
  assert.equal(destinations.length, 1)
  return destinations[0]
}

test('old homepage no longer displays public content and points normal visits to the new host', () => {
  for (const suffix of ['', '?q=poetry', '?utm_source=facebook#articles', '?view=blog', '?app=blog']) {
    assert.equal(redirect(suffix), PUBLIC_ORIGIN + '/' + suffix)
  }
  const html = readFileSync(new URL('../public/legacy-home.html', import.meta.url), 'utf8')
  assert.ok(html.includes('href="' + PUBLIC_ORIGIN + '/"'))
  assert.match(html, /noindex, follow/)
  assert.match(html, /src="\/home-redirect.js"/)
  assert.doesNotMatch(html, /id="root"|manifest|http-equiv="refresh"/)
})

test('legacy member/PWA hash routes remain on the member origin with their deep link intact', () => {
  for (const suffix of ['#/', '#/login', '#/tasks?id=123', '#/blog-management', '?from=old#/login?return=%2Fabout']) {
    assert.equal(redirect(suffix), SOURCE_ORIGIN + '/member' + suffix)
  }
})

test('auth callbacks never leak query or hash tokens to the public domain', () => {
  for (const suffix of ['?code=fixture', '?token_hash=fixture&type=recovery', '#access_token=fixture&refresh_token=fixture', '#error=access_denied', '?error_description=fixture']) {
    const target = new URL(redirect(suffix))
    assert.equal(target.origin, SOURCE_ORIGIN)
    assert.equal(target.pathname, '/member')
    assert.equal(target.search + target.hash, suffix)
  }
})

test('old sitemap omits its retired root while new-host sitemap keeps its homepage', () => {
  assert.ok(!publicSitemapPaths(SOURCE_ORIGIN).includes('/'))
  assert.ok(publicSitemapPaths(SOURCE_ORIGIN).includes('/literature'))
  assert.ok(publicSitemapPaths(PUBLIC_ORIGIN).includes('/'))
})
