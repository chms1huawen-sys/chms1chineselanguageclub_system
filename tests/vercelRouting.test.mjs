import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
assert.ok(!config.rewrites && !config.headers, 'Advanced routes cannot be combined with rewrites/headers')
const filesystem = config.routes.findIndex(route => route.handle === 'filesystem')
const root = config.routes.findIndex(route => route.src && new RegExp(route.src).test('/'))
assert.ok(root >= 0 && root < filesystem, 'Homepage must override the static index before filesystem routing')
assert.equal(config.routes[root].dest, '/api/blog')
const admin = config.routes.find(route => route.src && new RegExp(route.src).test('/blog-admin'))
assert.equal(admin.dest, '/index.html')
assert.equal(admin.headers['X-Robots-Tag'], 'noindex, nofollow')
for (const view of ['activities', 'literature', 'news', 'bookroom', 'about']) {
  const route = config.routes.find(route => route.src && new RegExp(route.src).test(`/${view}`))
  assert.equal(`/${view}`.replace(new RegExp(route.src), route.dest), `/api/blog?view=${view}`)
}
const article = config.routes.find(route => route.src && new RegExp(route.src).test('/blog/story-2026'))
assert.equal('/blog/story-2026'.replace(new RegExp(article.src), article.dest), '/api/blog?slug=story-2026')
for (const asset of ['/assets/index.js', '/manifest.json', '/firebase-messaging-sw.js', '/api/blog-media']) {
  assert.ok(!config.routes.slice(0, filesystem).some(route => route.src && new RegExp(route.src).test(asset)), asset)
}
assert.ok(config.routes.some(route => route.src && new RegExp(route.src).test('/sitemap.xml')))
console.log('Vercel homepage precedence, public routes, admin noindex and static assets passed.')
