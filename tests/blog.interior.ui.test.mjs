import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const fixture = await (await fetch('http://127.0.0.1:5173/tests/fixtures/blog.html')).text()
const posts = ['article', 'event', 'publication'].map((content_type, i) => ({ id: 'post' + i, slug: 'test-story' + i, title: 'Test story ' + i, author: 'Author', content_type, status: 'published', content_year: 2026, published_at: '2026-09-28', version: 1, summary: 'A short summary', body: 'Article body.', cover_path: '/login-group-2026.jpeg', book_details: { author: 'Book author', price: 'RM30' } }))
try {
  await mkdir('test-results/interior', { recursive: true })
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*.supabase.co/**', route => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = name === 'blog_settings' ? { title: 'Club', subtitle: 'School', content: {} } : name === 'blog_posts' ? posts : name === 'blog_categories' ? [{ id: 'cat', name: 'Category', section: 'article' }] : name === 'blog_media' ? Array.from({ length: 7 }, (_, i) => ({ id: 'photo' + i, path: i === 0 ? '/login-group-2026.jpeg' : '/login-event-2026.jpeg', caption: 'Photo ' + i })) : []
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  for (const width of [390, 320, 1440]) {
    const page = await context.newPage()
    await page.setViewportSize({ width, height: 900 })
    for (const path of ['/literature', '/activities', '/bookroom', '/about']) {
      await page.route('http://127.0.0.1:5173' + path, r => r.fulfill({ contentType: 'text/html', body: fixture }))
      await page.goto('http://127.0.0.1:5173' + path)
      await page.locator('.blog-skeleton').waitFor({ state: 'hidden' })
      if (width < 700) {
        await page.getByRole('button', { name: '展开菜单', exact: true }).click()
        const nav = await page.locator('.blog-nav nav').boundingBox()
        assert.ok(nav.height < 310, 'closed submenus must not reserve blank space')
        await page.getByRole('button', { name: '文学角落分类' }).click()
        assert.equal(await page.locator('.blog-mega-menu.is-open').isVisible(), true)
        await page.keyboard.press('Escape')
        assert.equal(await page.getByRole('button', { name: '展开菜单', exact: true }).isVisible(), true)
        await page.getByRole('button', { name: '展开搜索', exact: true }).click()
        assert.equal(await page.getByRole('searchbox').isVisible(), true)
        await page.keyboard.press('Escape')
        assert.equal(await page.getByRole('searchbox').isVisible(), false)
      }
      if (path === '/bookroom') {
        assert.equal(await page.locator('.blog-post img').first().evaluate(e => getComputedStyle(e).objectFit), 'contain')
        assert.match(await page.locator('.blog-post').first().textContent(), /查看书籍/)
      }
      assert.equal(await page.locator('main h1').count(), 1, 'each interior page has a primary heading')
      if (path === '/about') {
        assert.equal(await page.locator('.blog-community').evaluate(e => getComputedStyle(e).marginTop), '0px')
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: 'test-results/interior/' + path.slice(1) + '-' + width + '.png' })
    }
    await page.close()
  }
  const admin = await context.newPage()
  await admin.setViewportSize({ width: 1440, height: 900 })
  await admin.goto('http://127.0.0.1:5173/tests/fixtures/blog.html?mode=admin')
  await admin.getByRole('button', { name: '内容管理', exact: true }).click()
  await admin.getByRole('button', { name: '编辑', exact: true }).first().click()
  await admin.getByRole('button', { name: '预览', exact: true }).click()
  const frame = admin.frameLocator('.bs-preview-frame')
  await frame.locator('.blog-article h1').waitFor()
  assert.equal(await frame.locator('.blog-article-author').evaluate(e => !!(e.compareDocumentPosition(e.parentElement.querySelector('.blog-article-summary')) & Node.DOCUMENT_POSITION_FOLLOWING)), true)
  assert.equal(await frame.locator('.blog-photo-collage figure').count(), 4)
  assert.equal(await frame.locator('.blog-photo-more').textContent(), '+2')
  assert.ok(await frame.locator('.blog-article-summary').isVisible())
  await admin.getByRole('button', { name: '手机', exact: true }).click()
  assert.equal(await admin.locator('iframe').evaluate(e => e.contentWindow.innerWidth), 390)
  await admin.screenshot({ path: 'test-results/interior/preview.png' })
  await admin.getByRole('button', { name: '继续编辑', exact: true }).click()
  await admin.getByRole('button', { name: '更多格式', exact: true }).click()
  assert.equal(await admin.getByRole('button', { name: '上标', exact: true }).isVisible(), true)
  await admin.getByRole('button', { name: '收起格式', exact: true }).click()
  assert.equal(await admin.getByRole('button', { name: '上标', exact: true }).count(), 0)
  await admin.setViewportSize({ width: 390, height: 850 })
  await admin.locator('.bs-savebar').scrollIntoViewIfNeeded()
  assert.equal(await admin.locator('.bs-savebar').evaluate(e => getComputedStyle(e).position), 'sticky')
  assert.equal(await admin.getByLabel('活动日期', { exact: true }).isVisible(), false)
  await admin.getByText('活动资料', { exact: true }).click()
  assert.equal(await admin.getByLabel('活动日期', { exact: true }).isVisible(), true)
  await admin.getByRole('button', { name: '返回列表', exact: true }).click()
  const table = await admin.locator('.bs-table').boundingBox()
  assert.ok(table.width <= 390, 'mobile records do not require horizontal scrolling')
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await admin.screenshot({ path: 'test-results/interior/admin-mobile.png' })
  await admin.close()
  console.log('Public mobile navigation, closed dropdown spacing, book covers, desktop layout and shared article preview passed.')
} finally { await browser.close() }
