import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const context = await browser.newContext()
  await context.route('**/*.supabase.co/**', async route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = table === 'blog_settings' ? { title: 'Club', content: {} } : table === 'blog_posts' ? [{ id: 'book', slug: 'test-story', title: 'Book', status: 'published', content_type: 'publication', cover_path: '/login-group-2026.jpeg' }] : table === 'blog_media' ? [{ id: 'photo', post_id: 'book', path: '/login-group-2026.jpeg', caption: 'Cover', crop: { x: 0, y: 0, width: 100, height: 90, naturalWidth: 1280, naturalHeight: 960 }, width_percent: 75 }] : []
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  for (const width of [1440, 390]) {
    const page = await context.newPage()
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html?mode=article')
    await page.locator('.blog-cover-figure img').waitFor()
    const frame = await page.locator('span.blog-article-cover').boundingBox()
    assert.ok(frame.width > 100 && frame.height > 100, 'guest cropped cover must not collapse')
    assert.ok(Math.abs(frame.width / frame.height - 1280 / 864) < .01, 'crop ratio is preserved')
    await page.getByRole('button', { name: '查看封面大图' }).click()
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.close()
  }
  console.log('Guest cropped book covers: desktop/mobile dimensions, crop ratio and lightbox passed.')
} finally { await browser.close() }
