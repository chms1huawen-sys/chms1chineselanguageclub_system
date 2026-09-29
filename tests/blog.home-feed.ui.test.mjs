import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const audit = process.argv.includes('--audit')
const posts = Array.from({ length: 23 }, (_, i) => ({ id: String(i), slug: 'story-' + i, title: '传承我们的故事与回忆 ' + i, summary: '记录学会每一次相聚的时刻。', author: '作者姓名', content_type: ['article', 'publication', 'event', 'notice'][i % 4], featured: i < 9, status: 'published', published_at: `2026-09-${String(29 - i).padStart(2, '0')}`, cover_path: '/login-group-2026.jpeg' }))
try {
  await mkdir('test-results/home-feed', { recursive: true })
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*.supabase.co/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(table === 'blog_settings' ? { title: '华文学会', subtitle: '古晋中华第一中学', hero_path: '/login-group-2026.jpeg', content: {} } : table === 'blog_posts' ? posts : []) })
  })
  for (const width of [320, 390, 768, 1440]) {
    for (const lang of ['zh', 'en']) {
      const page = await context.newPage()
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`http://127.0.0.1:5173/tests/fixtures/blog.html?mode=editor&lang=${lang}`)
      await page.locator('#articles .blog-post').first().waitFor()
      const overflow = await page.evaluate(() => [...document.querySelectorAll('.blog-post-meta,.blog-section-heading,.blog-public-actions')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => ({ element: e.className, text: e.textContent, width: e.clientWidth, content: e.scrollWidth })))
      console.log(width, lang, JSON.stringify(overflow))
      console.log(await page.evaluate(() => [...document.querySelectorAll('.blog-brand,.blog-public-actions,.blog-showcase,.blog-showcase-slides,.blog-showcase-caption,.blog-community,.blog-footer')].map(e => ({ c: e.className, x: e.getBoundingClientRect().x, w: e.getBoundingClientRect().width }))))
      await page.screenshot({ path: `test-results/home-feed/${audit ? 'before' : 'after'}-${width}-${lang}.png` })
      if (!audit) {
        assert.deepEqual(overflow, [])
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
        assert.equal(await page.locator('#articles .blog-post').count(), 6)
        const featured = page.locator('.blog-public-section').filter({ has: page.locator('.blog-post-grid') }).first()
        assert.equal(await featured.locator('.blog-post').count(), 6)
        for (const type of ['article', 'publication', 'event', 'notice']) assert.ok(await featured.locator(`[data-kind=${type}]`).count())
        await page.locator('.blog-more').click()
        assert.equal(await page.locator('#articles .blog-post').count(), 14)
        await page.locator('.blog-more').click()
        assert.equal(await page.locator('#articles .blog-post').count(), 22)
        await page.locator('.blog-more').click()
        assert.equal(await page.locator('#articles .blog-post').count(), 23)
        assert.equal(await page.locator('.blog-more').count(), 0)
      }
      await page.close()
    }
  }
} finally { await browser.close() }
