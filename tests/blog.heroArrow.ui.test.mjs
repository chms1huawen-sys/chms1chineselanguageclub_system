import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: { width: touch ? 390 : 1366, height: 900 }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block' })
    await context.route('**/*.supabase.co/**', route => {
      const table = new URL(route.request().url()).pathname.split('/').at(-1)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(table === 'blog_settings' ? { title: '一中华文学会', content: { hero_interval: 3, hero_slides: [{ path: '/login-event-2026.jpeg', title: '第二张' }] } } : []) })
    })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html')
    const hero = page.locator('.blog-showcase')
    await page.waitForFunction(() => document.querySelector('.blog-showcase-slide.is-active img')?.naturalWidth > 0)
    const next = page.getByRole('button', { name: '下一张', exact: true })
    if (touch) await next.tap(); else await next.click()
    await hero.locator('.is-active h1').filter({ hasText: '第二张' }).waitFor()
    if (!touch) {
      await page.mouse.move(0, 0)
      await page.waitForTimeout(400)
      assert.equal(await next.evaluate(el => document.activeElement === el), true, 'button may remain focused without keeping hero dark')
      assert.equal(await hero.locator('.is-active').evaluate(el => getComputedStyle(el, '::after').opacity), '0')
      assert.equal(await hero.locator('.is-active h1').evaluate(el => getComputedStyle(el).color), 'rgb(23, 59, 80)')
    }
    await page.waitForFunction(() => document.querySelector('.blog-showcase-dots button')?.getAttribute('aria-pressed') === 'true', null, { timeout: 6000 })
    if (!touch) {
      await next.click()
      await hero.locator('.is-active h1').filter({ hasText: '第二张' }).waitFor()
      await page.mouse.move(0, 0)
      await page.getByRole('button', { name: '上一张', exact: true }).click()
      await page.mouse.move(0, 0)
      await page.waitForTimeout(400)
      assert.equal(await hero.locator('.is-active').evaluate(el => getComputedStyle(el, '::after').opacity), '0')
      await page.keyboard.press('Tab')
      await next.focus()
      await page.waitForTimeout(400)
      assert.equal(await hero.locator('.is-active').evaluate(el => getComputedStyle(el, '::after').opacity), '1')
      const active = await hero.locator('.blog-showcase-dots button[aria-pressed=true]').getAttribute('aria-label')
      await page.waitForTimeout(3300)
      assert.equal(await hero.locator('.blog-showcase-dots button[aria-pressed=true]').getAttribute('aria-label'), active)
    }
    await hero.screenshot({ path: `${process.env.TEMP}/hero-arrow-${touch ? 'touch' : 'desktop'}.png` })
    await context.close()
  }
  console.log('Arrow clicks no longer latch dark state; autoplay resumes on mouse leave and touch, while keyboard focus pauses safely.')
} finally { await browser.close() }
