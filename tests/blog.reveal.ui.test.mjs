import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  for (const width of [390, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 850 }, serviceWorkers: 'block' })
    let requests = 0
    const posts = Array.from({ length: 6 }, (_, index) => ({ id: String(index), slug: `story-${index}`, title: `测试文章 ${index}`, content_type: 'article', status: 'published', featured: true, published_at: '2026-10-12', cover_path: '/login-group-2026.jpeg' }))
    await context.route('**/*.supabase.co/**', route => {
      requests++
      const table = new URL(route.request().url()).pathname.split('/').at(-1)
      const data = table === 'blog_posts' ? posts : table === 'blog_settings' ? { title: '一中华文学会', about: '学会简介', content: {} } : []
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html')
    await page.locator('.blog-post').first().waitFor()
    assert.equal(await page.title(), '古晋一中华文学会')
    await page.evaluate(() => {
      window.revealAnimations = 0
      const animate = Element.prototype.animate
      Element.prototype.animate = function (...args) { window.revealAnimations++; return animate.apply(this, args) }
    })
    const target = page.locator('.blog-post').last()
    await target.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    assert.ok(await page.evaluate(() => window.revealAnimations > 0))
    const count = await page.evaluate(() => window.revealAnimations)
    const before = requests
    await page.evaluate(() => scrollTo(0, 0))
    await target.scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    assert.equal(await page.evaluate(() => window.revealAnimations), count)
    assert.equal(requests, before, 'scroll must not refetch Supabase data')
    assert.equal(await target.evaluate(el => getComputedStyle(el).opacity), '1')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `${process.env.TEMP}/blog-reveal-${width}.png` })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.reload()
    await page.locator('.blog-post').first().waitFor()
    await page.evaluate(() => {
      window.revealAnimations = 0
      const animate = Element.prototype.animate
      Element.prototype.animate = function (...args) { window.revealAnimations++; return animate.apply(this, args) }
    })
    await page.locator('.blog-post').last().scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    assert.equal(await page.evaluate(() => window.revealAnimations), 0)
    assert.equal(await page.locator('.blog-post').last().evaluate(el => getComputedStyle(el).opacity), '1')
    assert.deepEqual(errors, [])
    await context.close()
  }
  console.log('Homepage title, mobile/desktop reveal, one-shot motion, reduced motion, no extra data requests and overflow passed.')
} finally { await browser.close() }
