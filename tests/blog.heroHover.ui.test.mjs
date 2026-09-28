import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  await mkdir('test-results/hero-hover', { recursive: true })
  for (const width of [1440, 768, 390, 320]) {
    const touch = width < 800
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: touch, isMobile: touch, serviceWorkers: 'block' })
    await context.route('**/*.supabase.co/**', route => {
      const table = new URL(route.request().url()).pathname.split('/').at(-1)
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(table === 'blog_settings' ? { title: '华文学会', subtitle: '古晋中华第一中学', hero_path: '/login-group-2026.jpeg', content: { hero_crop: { x: 0, y: 0, width: 100, height: 100, naturalWidth: 1280, naturalHeight: 960 }, hero_interval: 60, hero_slides: [{ path: '/login-event-2026.jpeg', title: '活动记录' }] } } : []) })
    })
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html')
    const hero = page.locator('.blog-showcase')
    await page.waitForFunction(() => document.querySelector('.blog-showcase-slide.is-active img')?.naturalWidth > 0)
    await page.waitForTimeout(400)
    const geometry = await page.locator('.blog-showcase-slide.is-active img').evaluate(img => ({ w: img.getBoundingClientRect().width, h: img.getBoundingClientRect().height, ratio: img.naturalWidth / img.naturalHeight }))
    assert.ok(Math.abs(geometry.w / geometry.h - geometry.ratio) < .01, `image is not distorted at ${width}`)
    assert.equal(await hero.locator('.blog-showcase-pause').count(), 0)
    const title = hero.locator('.is-active h1')
    const cta = hero.locator('.is-active .blog-showcase-cta')
    assert.equal(await cta.evaluate(el => getComputedStyle(el).fontWeight), '600')
    if (width <= 700) {
      const button = await cta.boundingBox()
      const arrow = await hero.locator('.blog-showcase-prev').boundingBox()
      const frame = await hero.locator('.blog-showcase-slides').boundingBox()
      assert.ok(arrow.x + arrow.width <= button.x, 'mobile arrows do not overlap the CTA')
      assert.ok(frame.height < 250, 'mobile Hero is a compact landscape banner')
      assert.ok(button.y + button.height <= frame.y + frame.height - 30, 'CTA stays above pagination')
    }
    if (!touch) {
      assert.equal(await title.evaluate(el => getComputedStyle(el).color), 'rgb(23, 59, 80)')
      assert.equal(await hero.locator('.is-active').evaluate(el => getComputedStyle(el, '::after').opacity), '0')
      await hero.screenshot({ path: 'test-results/hero-hover/rest.png' })
      assert.equal(await hero.locator('.is-active').evaluate(el => getComputedStyle(el, '::before').opacity), '1')
      await hero.hover()
      await page.waitForTimeout(400)
      assert.equal(await title.evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)')
      assert.equal(await hero.locator('.is-active').evaluate(el => getComputedStyle(el, '::before').opacity), '0')
      await hero.screenshot({ path: 'test-results/hero-hover/hover.png' })
      await page.mouse.move(0, 0)
      await page.waitForTimeout(400)
      assert.equal(await title.evaluate(el => getComputedStyle(el).color), 'rgb(23, 59, 80)')
      await cta.focus()
      await page.waitForTimeout(400)
      assert.equal(await title.evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)')
    } else {
      assert.equal(await title.evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)')
      await hero.screenshot({ path: `test-results/hero-hover/touch-${width}.png` })
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await context.close()
  }
  console.log('Hover/revert, touch fallback, removed pause control and undistorted cropped images passed at 320/390/768/1440.')
} finally { await browser.close() }
