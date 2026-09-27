import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*.supabase.co/**', async route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = table === 'blog_settings' ? { title: '华文学会', subtitle: '古晋中华第一中学', hero_path: '/login-group-2026.jpeg', content: {} } : table === 'blog_posts' ? [
      { id: 'a', slug: 'story', title: '文字里的学会生活', summary: '记录我们共同度过的时光。', published_at: '2026-09-27', content_type: 'article' },
      { id: 'b', slug: 'book', title: '华苑文萃', summary: '属于我们的文字。', published_at: '2026-09-26', content_type: 'publication', cover_path: '/login-event-2026.jpeg' },
    ] : []
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await mkdir('test-results/home-polish', { recursive: true })
  for (const width of [1440, 768, 390, 320]) {
    const page = await context.newPage()
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html')
    await page.getByRole('heading', { name: '文字里的学会生活' }).waitFor()
    assert.equal(await page.getByText('精选故事即将更新。').count(), 0)
    assert.equal(await page.locator('[data-kind=publication] > img').evaluate(el => getComputedStyle(el).objectFit), 'contain')
    if (width < 701) {
      assert.ok((await page.locator('.blog-nav').boundingBox()).height < 110)
      assert.equal(await page.getByRole('navigation').isVisible(), false)
      await page.getByRole('button', { name: '展开菜单', exact: true }).click()
      assert.equal(await page.getByRole('navigation').isVisible(), true)
      await page.getByRole('button', { name: 'Switch to English' }).waitFor()
      await page.keyboard.press('Escape')
      assert.equal(await page.getByRole('navigation').isVisible(), false)
      await page.getByRole('button', { name: '展开搜索', exact: true }).click()
      assert.equal(await page.getByRole('searchbox').evaluate(el => el === document.activeElement), true)
      await page.keyboard.press('Escape')
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `test-results/home-polish/${width}.png`, fullPage: true })
    await page.close()
  }
  await context.close()
  console.log('Homepage: compact navigation, keyboard dismissal, search focus, hidden empty featured section, book framing and responsive overflow passed.')
} finally { await browser.close() }
