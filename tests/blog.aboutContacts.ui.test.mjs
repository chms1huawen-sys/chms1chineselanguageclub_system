import assert from 'node:assert/strict'
import { renderBlogHtml } from '../server/blogSeo.js'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
let links = [{ platform: 'facebook', label: 'Facebook', url: 'https://facebook.com/example/' }, { platform: 'instagram', label: 'Instagram', url: 'https://instagram.com/example/' }, { platform: 'email', label: 'Gmail', url: 'test@gmail.com' }, { platform: 'email', label: 'Hidden', url: 'hidden@gmail.com', enabled: false }, { platform: 'website', label: 'Invalid', url: 'javascript:alert(1)' }]
const settings = () => ({ title: '一中华文学会', intro: '学会简介', about: '关于我们的详细介绍。', content: { social_links: links } })
try {
  const template = '<head></head><div id="root"></div>'
  const html = renderBlogHtml(template, settings(), [], [], '', 'https://example.com', 'about')
  assert.ok(html.includes('class="blog-about-contact"'))
  assert.ok(html.includes('href="mailto:test@gmail.com"'))
  assert.ok(!html.includes('href="mailto:hidden@gmail.com"'))
  assert.ok(!renderBlogHtml(template, settings(), [], [], '', 'https://example.com').includes('class="blog-about-contact"'))
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*.supabase.co/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(new URL(route.request().url()).pathname.endsWith('/blog_settings') ? settings() : []) }))
  const page = await context.newPage()
  for (const width of [390, 1366]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:5173/about')
    const contact = page.locator('.blog-about-contact')
    await contact.getByRole('heading', { name: '联系我们', exact: true }).waitFor()
    assert.equal(await contact.getByRole('link').count(), 3)
    assert.equal(await contact.getByRole('link', { name: 'Gmail', exact: true }).getAttribute('href'), 'mailto:test@gmail.com')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await contact.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${process.env.TEMP}/about-contacts-${width}.png` })
  }
  links = []
  await page.reload()
  await page.getByText('关于我们的详细介绍。', { exact: true }).waitFor()
  assert.equal(await page.locator('.blog-about-contact').count(), 0)
  console.log('About contacts: shared settings, safe SSR/email, desktop/mobile layout, hidden/invalid links and empty state passed.')
} finally { await browser.close() }
