import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const posts = ['article', 'event', 'publication', 'notice'].flatMap(content_type =>
  Array.from({ length: 3 }, (_, i) => ({
    id: `${content_type}-${i}`, slug: `${content_type}-${i}`, title: `测试作品 ${i}`,
    content_type, category_id: 'category', author: '测试作者', status: 'published',
    summary: '相同分类、不同排列位置的样式应该保持一致。', featured: true,
    published_at: `2026-10-${12 - i}`, content_year: 2026,
    cover_path: '/login-group-2026.jpeg', book_details: { author: '测试作者' },
  })))
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.addInitScript(() => {
    const path = new URLSearchParams(location.search).get('path')
    if (path) history.replaceState(null, '', path + location.search)
  })
  await context.route('**/*.supabase.co/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = table === 'blog_posts' ? posts : table === 'blog_categories'
      ? [{ id: 'category', name: '比赛', section: 'all' }]
      : table === 'blog_settings' ? { title: '一中华文学会', content: {} } : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  const page = await context.newPage()
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/', '/literature', '/activities', '/bookroom', '/news']) {
      await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html?path=' + encodeURIComponent(path))
      await page.locator('.blog-post').first().waitFor()
      const labels = await page.locator('.blog-post .blog-eyebrow').evaluateAll(elements => elements.map(el => {
        const style = getComputedStyle(el)
        return { color: style.color, background: style.backgroundColor, padding: style.padding, fontSize: style.fontSize }
      }))
      assert.ok(labels.length >= 3)
      for (const label of labels) {
        assert.equal(label.background, 'rgba(0, 0, 0, 0)', `${path}, ${width}: old badge background`)
        assert.equal(label.padding, '0px')
        assert.deepEqual(label, labels[0], `${path}, ${width}: position-dependent label`)
      }
      const cardStyle = () => page.locator('.blog-post').first().evaluate(el => {
        const read = (node, properties) => Object.fromEntries(properties.map(property => [property, getComputedStyle(node)[property]]))
        return {
          card: read(el, ['display', 'gridTemplateColumns', 'gap', 'borderRadius']),
          title: read(el.querySelector('h3'), ['fontSize', 'lineHeight', 'margin', 'maxWidth']),
          copy: read(el.querySelector('.blog-post-copy'), ['padding', 'alignItems', 'justifyContent']),
          image: read(el.querySelector('img'), ['aspectRatio', 'objectFit', 'minHeight', 'maxHeight']),
        }
      })
      const before = await cardStyle()
      await page.locator('.blog-post').first().evaluate(el => {
        [...el.parentElement.children].filter(sibling => sibling !== el).forEach(sibling => sibling.remove())
      })
      assert.deepEqual(await cardStyle(), before, `${path}, ${width}: singleton changed card style`)
      const author = page.locator('.blog-card-author').first()
      if (await author.count()) {
        assert.deepEqual(await author.evaluate(el => {
          const s = getComputedStyle(el)
          return [s.display, s.borderTopWidth, s.paddingTop, s.marginTop]
        }), ['inline', '0px', '0px', '0px'])
      }
      if (path === '/bookroom') assert.equal(before.image.objectFit, 'contain')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      if (path === '/activities' && width === 390) await page.screenshot({ path: `${process.env.TEMP}/blog-unified-categories-390.png` })
    }
  }
  console.log('Public CSS: five feeds, four widths, label positions, singleton cards, authors and book covers passed.')
} finally { await browser.close() }
