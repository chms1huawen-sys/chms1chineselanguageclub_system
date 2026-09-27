import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  await page.addInitScript(() => localStorage.setItem('clc_blog_statistics', 'declined'))
  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:5173/')
    await page.locator('.blog-home .blog-showcase').waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    const hero = await page.locator('.blog-showcase').boundingBox()
    assert.ok(hero.width >= Math.min(width, 1100))
    if (width <= 700) assert.equal(await page.locator('.blog-showcase-controls > button').first().evaluate(el => el.getBoundingClientRect().height), 44)
  }
  for (const path of ['/literature', '/activities', '/bookroom', '/about', '/?q=test', '/blog/test-story', '/blog-admin']) {
    await page.goto('http://127.0.0.1:5173' + path)
    await page.waitForTimeout(300)
    assert.equal(await page.locator('.blog-home').count(), 0, path + ' must not use homepage styles')
  }
  console.log('Homepage layout verified at 320/390/768/1440; non-home routes remain isolated.')
} finally { await browser.close() }
