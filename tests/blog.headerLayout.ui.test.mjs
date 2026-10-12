import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*.supabase.co/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(table === 'blog_settings' ? { title: '一中华文学会', subtitle: '古晋中华第一中学', content: {} } : []) })
  })
  const page = await context.newPage()
  for (const member of [false, true]) {
    await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html' + (member ? '?mode=editor' : ''))
    await page.locator('.blog-brand').filter({ hasText: '一中华文学会' }).waitFor()
    for (const width of [360, 390, 700, 768, 1024, 1200, 1201, 1280, 1366, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const geometry = await page.evaluate(() => {
        const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right } }
        return { overflow: document.documentElement.scrollWidth > innerWidth, brand: rect('.blog-brand'), search: rect('.blog-global-search'), actions: rect('.blog-public-actions'), nav: rect('.blog-nav nav') }
      })
      assert.equal(geometry.overflow, false, `overflow at ${width}, member=${member}`)
      if (width > 1200) {
        assert.equal(await page.getByRole('button', { name: '展开菜单', exact: true }).isVisible(), false)
        assert.equal(await page.getByRole('button', { name: '展开搜索', exact: true }).isVisible(), false)
        assert.ok(Math.abs((geometry.actions.top + geometry.actions.bottom) - (geometry.brand.top + geometry.brand.bottom)) < 2, `actions dropped at ${width}`)
        assert.ok(geometry.nav.right <= geometry.search.left, `nav overlaps search at ${width}`)
        assert.ok(geometry.search.right <= geometry.actions.left, `search overlaps actions at ${width}`)
        assert.equal(await page.evaluate(() => {
          const edge = document.querySelector('.blog-global-search').getBoundingClientRect().left
          return [...document.querySelectorAll('.blog-nav nav > *')].every(el => el.getBoundingClientRect().right <= edge)
        }), true, `navigation content overlaps search at ${width}`)
      }
      if (member && [390, 768, 1366].includes(width)) await page.screenshot({ path: `${process.env.TEMP}/blog-header-${width}.png` })
    }
    await page.setViewportSize({ width: 390, height: 900 })
    await page.getByRole('button', { name: '展开菜单', exact: true }).click()
    await page.getByRole('link', { name: '关于我们', exact: true }).waitFor()
    await page.getByRole('button', { name: '收起菜单', exact: true }).click()
    await page.getByRole('button', { name: '展开搜索', exact: true }).click()
    await page.getByRole('searchbox').waitFor()
  }
  console.log('Header layout: 10 viewport widths, guest/admin, desktop alignment and mobile menu/search passed.')
} finally { await browser.close() }
