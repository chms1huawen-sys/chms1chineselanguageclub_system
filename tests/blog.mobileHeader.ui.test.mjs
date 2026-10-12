import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.addInitScript(() => {
    const path = new URLSearchParams(location.search).get('path')
    if (path) history.replaceState(null, '', path + location.search)
  })
  await context.route('**/*.supabase.co/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(new URL(route.request().url()).pathname.endsWith('/blog_settings') ? { title: '一中华文学会', content: {} } : []) }))
  const page = await context.newPage()
  for (const role of ['', '&member=1', '&mode=editor']) {
    for (const path of ['/', '/literature', '/activities', '/bookroom', '/about']) {
      await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html?path=' + encodeURIComponent(path) + role)
      await page.locator('.blog-brand').filter({ hasText: '一中华文学会' }).waitFor()
      for (const width of [320, 340, 360, 390, 430, 700]) {
        await page.setViewportSize({ width, height: 900 })
        const result = await page.evaluate(() => {
          const text = document.querySelector('.blog-brand > span'), brand = text.getBoundingClientRect(), actions = document.querySelector('.blog-public-actions').getBoundingClientRect()
          return { overflow: document.documentElement.scrollWidth > innerWidth, truncated: text.scrollWidth > text.clientWidth, oneLine: brand.height < 30, aligned: Math.abs(brand.top + brand.bottom - actions.top - actions.bottom) < 2 }
        })
        assert.deepEqual(result, { overflow: false, truncated: false, oneLine: true, aligned: true }, `${path} ${role} at ${width}`)
        if (path === '/literature' && role === '&mode=editor' && width === 390) await page.screenshot({ path: `${process.env.TEMP}/mobile-header-literature-390.png` })
      }
    }
  }
  console.log('Mobile header: five routes, guest/member/admin, six widths; full brand visible on one row without overflow.')
} finally { await browser.close() }
