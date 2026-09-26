import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import pageHandler from '../api/blog.js'
import sitemapHandler from '../api/sitemap.js'
import imageHandler from '../api/blog-media.js'

const post = { id: '1', slug: 'published', title: 'Published story', body: 'Real indexable article content.', summary: 'Summary', status: 'published', updated_at: '2026-09-25T00:00:00Z' }
const mock = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  assert.equal(req.headers.apikey, 'anonymous-test-key')
  res.setHeader('content-type', 'application/json')
  if (url.pathname.endsWith('blog_publish_due')) return res.end('0')
  if (url.pathname.endsWith('blog_post_albums') || url.pathname.endsWith('blog_links')) return res.end('[]')
  if (url.pathname.endsWith('blog_settings')) return res.end(JSON.stringify({ title: 'Club', subtitle: 'School', intro: 'Welcome', about: '', hero_path: '/login-group-2026.jpeg' }))
  if (url.pathname.endsWith('blog_posts')) {
    assert.equal(url.searchParams.get('status'), 'eq.published')
    const type = url.searchParams.get('content_type')
    if (type) assert.ok(['eq.event', 'eq.article', 'eq.publication', 'eq.notice'].includes(type))
    return res.end(JSON.stringify(url.searchParams.get('slug') === 'eq.hidden' ? [] : [post]))
  }
  if (url.pathname.endsWith('blog_media')) return res.end('[]')
  if (url.pathname.includes('/storage/v1/')) { res.statusCode = 400; return res.end(JSON.stringify({ message: 'Object not found' })) }
  res.statusCode = 500; res.end(JSON.stringify({ message: 'Unexpected endpoint' }))
})
await new Promise(resolve => mock.listen(0, '127.0.0.1', resolve))
process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${mock.address().port}`
process.env.VITE_SUPABASE_ANON_KEY = 'anonymous-test-key'
process.env.BLOG_SITE_URL = 'https://example.com'
function response() {
  return { headers: {}, code: 200, body: '', setHeader(key, value) { this.headers[key] = value }, status(code) { this.code = code; return this }, send(body) { this.body = body; return this }, end() { return this }, redirect(code, target) { this.code = code; this.headers.Location = target; return this } }
}
try {
  let res = response()
  await pageHandler({ method: 'GET', query: { slug: 'published' } }, res)
  assert.equal(res.code, 200); assert.ok(res.body.includes('Real indexable article content.'))
  assert.ok(res.body.includes('https://example.com/blog/published'))
  assert.ok(res.body.includes('/assets/index-'))
  assert.equal(res.headers['Cache-Control'], 'no-store')
  for (const view of ['literature', 'news', 'activities', 'bookroom', 'blog']) {
    res = response(); await pageHandler({ method: 'GET', query: { view } }, res)
    assert.equal(res.code, 200, view)
    assert.ok(res.body.includes('会员登入'))
    assert.ok(!res.body.includes('members-only-originals'))
  }
  res = response(); await pageHandler({ method: 'GET', query: { slug: 'hidden' } }, res)
  assert.equal(res.code, 404); assert.equal(res.headers['X-Robots-Tag'], 'noindex')
  res = response(); await sitemapHandler({ method: 'GET' }, res)
  assert.equal(res.code, 200); assert.ok(res.body.includes('https://example.com/blog/published'))
  assert.ok(res.body.includes('https://example.com/literature'))
  assert.ok(res.body.includes('https://example.com/news'))
  res = response(); await imageHandler({ method: 'GET', query: { path: '10000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001.jpg' } }, res)
  assert.equal(res.code, 404)
  res = response(); await pageHandler({ method: 'POST', query: {} }, res); assert.equal(res.code, 405)
  console.log('Production handlers: anonymous-only data, built asset references, SSR text, hidden 404, sitemap and private photo denial passed.')
} finally { await new Promise(resolve => mock.close(resolve)) }
