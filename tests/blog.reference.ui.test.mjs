import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
let book = false
let saved
const links = [{ platform: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/' }, { platform: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/' }]
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.addInitScript(() => localStorage.setItem('clc_blog_statistics', 'declined'))
  await context.route('**/*.supabase.co/**', async route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    if (table === 'blog_studio_save') {
      saved = route.request().postDataJSON()
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ...saved.p_post, version: 2 }) })
    }
    const data = table === 'blog_settings' ? { title: '华文学会', subtitle: '古晋中华第一中学', hero_path: '/login-group-2026.jpeg', content: { hero_title: '华文学会', hero_slides: [{ path: '/login-event-2026.jpeg', title: '第四届传承诗歌朗诵比赛', cta: '开始阅读' }] } } : table === 'blog_posts' ? [{ id: 'story', slug: 'test-story', title: '让故事留下', author: '林同学', summary: '记录我们的故事。', content_type: book ? 'publication' : 'article', status: 'published', content_year: 2026, version: 1, published_at: '2026-09-28', book_details: { purchase_label: '我要购买', purchase_links: links } }] : table === 'blog_media' ? Array.from({ length: 7 }, (_, i) => ({ id: `photo${i}`, path: '/login-group-2026.jpeg', caption: `Photo ${i + 1}`, width_percent: 25, crop: { x: 10, y: 0, width: 50, height: 100, naturalWidth: 1280, naturalHeight: 960 } })) : []
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await mkdir('test-results/reference', { recursive: true })
  for (const width of [1440, 390]) {
    const page = await context.newPage()
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html')
    await page.locator('.blog-card-author').waitFor()
    assert.match(await page.locator('.blog-card-author').textContent(), /林同学/)
    await page.locator('.blog-showcase').hover()
    await page.waitForFunction(() => document.querySelector('.blog-showcase img')?.naturalWidth > 0)
    const hero = await page.locator('.blog-showcase-slides').boundingBox()
    const photo = await page.locator('.blog-showcase-slide.is-active img').boundingBox()
    assert.ok(photo.width >= hero.width - 2 && photo.height >= hero.height - 2, 'photo fills Hero')
    const previous = await page.locator('.blog-showcase-prev').boundingBox()
    assert.ok(Math.abs(previous.y + previous.height / 2 - hero.y - hero.height / 2) < 3)
    await page.locator('.blog-showcase').screenshot({ path: `test-results/reference/hero-${width}.png` })
    await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html?mode=article')
    await page.locator('.blog-photo-more').waitFor()
    assert.equal(await page.locator('.blog-photo-collage figure').count(), 4)
    assert.equal(await page.locator('.blog-photo-more').textContent(), '+3')
    const tiles = await page.locator('.blog-photo-collage button').evaluateAll(es => es.map(e => ({ w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height })))
    assert.ok(tiles.every(t => Math.abs(t.w / t.h - 4 / 3) < .01))
    await page.locator('.blog-photo-more').click()
    await page.getByRole('dialog').waitFor()
    const image = await page.locator('.blog-lightbox img').boundingBox()
    assert.ok(Math.abs(image.x + image.width / 2 - width / 2) < 2, 'original photo is horizontally centered')
    await page.getByRole('dialog').screenshot({ path: `test-results/reference/viewer-${width}.png` })
    await page.keyboard.press('Escape')
    book = true
    await page.reload()
    await page.getByText('我要购买', { exact: true }).click()
    assert.ok(await page.locator('.blog-book-details').evaluate(el => !!(el.compareDocumentPosition(document.querySelector('.blog-article > .blog-prose')) & Node.DOCUMENT_POSITION_FOLLOWING)), 'book details and purchase entry precede the article body')
    assert.ok(await page.locator('.blog-purchase-options').getByRole('link', { name: 'Instagram' }).isVisible())
    assert.ok(await page.locator('.blog-purchase-options').getByRole('link', { name: 'Facebook' }).isVisible())
    await page.keyboard.press('Escape')
    assert.equal(await page.locator('.blog-purchase').getAttribute('open'), null)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    book = false
    await page.close()
  }
  book = true
  const admin = await context.newPage()
  await admin.goto('http://127.0.0.1:5173/tests/fixtures/blog.html?mode=admin')
  await admin.getByRole('button', { name: '内容管理', exact: true }).click()
  await admin.getByRole('combobox', { name: '管理年份' }).selectOption('')
  await admin.getByRole('button', { name: '编辑', exact: true }).first().click()
  await admin.getByLabel('购买按钮文字', { exact: true }).fill('联系我们订购')
  await admin.getByRole('button', { name: '保存内容', exact: true }).click()
  await admin.getByRole('status').waitFor()
  assert.equal(saved.p_post.book_details.purchase_label, '联系我们订购')
  assert.deepEqual(saved.p_post.book_details.purchase_links, links)
  await admin.close()
  console.log('Reference Hero, author byline, four-photo collage, centered viewer, dual purchase links and CMS label persistence passed.')
} finally { await browser.close() }
