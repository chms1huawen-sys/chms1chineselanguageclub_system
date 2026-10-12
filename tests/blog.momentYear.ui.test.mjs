import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*.supabase.co/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = table === 'blog_settings' ? { title: '一中华文学会', content: {} } : table === 'blog_posts' ? [{ id: 'event', title: '茶艺体验活动', slug: 'tea', content_type: 'event', cover_path: '/login-event-2026.jpeg', status: 'published', published_at: '2026-01-01T00:00:00Z' }] : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  const page = await context.newPage()
  for (const width of [320, 390, 1366]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:5173/')
    const moment = page.locator('.blog-album').first()
    await moment.locator('small').filter({ hasText: '2026' }).waitFor()
    const decline = page.getByRole('button', { name: '不允许', exact: true })
    if (await decline.isVisible()) await decline.click()
    await moment.scrollIntoViewIfNeeded()
    const inset = await moment.evaluate(el => {
      const card = el.getBoundingClientRect(), label = el.querySelector('small')
      const range = document.createRange(); range.selectNodeContents(label)
      const text = range.getBoundingClientRect()
      return { left: text.left - card.left, bottom: card.bottom - text.bottom }
    })
    assert.ok(inset.left >= 12 && inset.bottom >= 12, `year stays clear of rounded clip at ${width}: ${JSON.stringify(inset)}`)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `${process.env.TEMP}/moment-year-${width}.png` })
  }
  console.log('Moment year text is inset from rounded clipping at 320/390/1366.')
} finally { await browser.close() }
