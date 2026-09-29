import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const p = text => ({ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] })
const document = { type: 'doc', content: [p('First'), p('Second'), p(), p('Third'), p(), p(), p('Fourth')] }
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  let type = 'article'
  await context.route('**/*.supabase.co/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = table === 'blog_settings' ? { title: 'Club', content: {} } : table === 'blog_posts' ? [{ id: 'post', slug: 'test-story', title: 'Spacing', content_type: type, status: 'published', body_document: document }] : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  const page = await context.newPage()
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (type of ['article', 'event', 'publication', 'notice']) {
      await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html?mode=article')
      await page.locator('.blog-prose p').first().waitFor()
      const boxes = await page.locator('.blog-prose p').evaluateAll(ps => ps.map(p => ({ y: p.getBoundingClientRect().y, h: p.getBoundingClientRect().height })))
      assert.equal(boxes.length, 7)
      assert.ok(boxes[2].h > 25, `${type}: empty paragraph reserves a line`)
      const normal = boxes[1].y - boxes[0].y
      assert.ok(Math.abs(normal - boxes[0].h) < 1, 'ordinary Enter has no extra paragraph gap')
      const oneBlank = boxes[3].y - boxes[1].y
      const twoBlanks = boxes[6].y - boxes[3].y
      assert.ok(oneBlank > normal + 25 && twoBlanks > oneBlank + 25, `${type}: extra blank lines produce increasing spacing at ${width}px`)
    }
  }
  console.log('All four content types preserve one and multiple blank paragraphs on mobile and desktop.')
} finally { await browser.close() }
