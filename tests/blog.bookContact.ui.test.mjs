import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const current = new Date().getFullYear()
const book = { id: 'book', title: 'Book contact test', slug: 'test-story', content_type: 'publication', content_year: current, status: 'published', published_at: `${current}-01-01T00:00:00Z`, body: 'Book', book_details: { published_on: '2005-01-01', purchase_links: [{ platform: 'email', label: 'Gmail', url: 'test@gmail.com' }] } }
let saved
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*.supabase.co/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    let data = []
    if (table === 'blog_posts') data = [book]
    if (table === 'blog_settings') data = { title: '一中华文学会', content: {} }
    if (table === 'blog_years') data = [{ year: 2005, is_archived: false }, { year: 2021, is_archived: false }, { year: 2020, is_archived: true }, { year: current, is_archived: false }]
    if (table === 'blog_studio_save') { saved = route.request().postDataJSON().p_post; data = saved }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html?mode=admin')
  await page.getByText('高级：按内容年份锁定编辑', { exact: true }).waitFor()
  const archives = page.locator('.bs-year-list')
  assert.equal(await archives.getByText('2005', { exact: true }).count(), 0)
  assert.equal(await archives.getByText('2021', { exact: true }).count(), 0)
  assert.equal(await archives.getByText('2020', { exact: true }).count(), 1)
  await page.getByRole('button', { name: '书坊管理', exact: true }).click()
  await page.getByRole('button', { name: book.title, exact: true }).click()
  await page.getByLabel('平台图标').selectOption('email')
  await page.getByLabel('邮箱地址').fill('new@example.com')
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.getByLabel('邮箱地址').scrollIntoViewIfNeeded()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `${process.env.TEMP}/book-contact-${width}.png` })
  }
  await page.getByRole('button', { name: '保存内容', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '内容、链接与照片说明已保存' }).waitFor()
  assert.equal(saved.book_details.purchase_links[0].url, 'new@example.com')
  assert.equal(saved.book_details.published_on, '2005-01-01')
  await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html?mode=article')
  await page.getByRole('link', { name: '联系购买', exact: true }).waitFor()
  assert.equal(await page.getByRole('link', { name: '联系购买', exact: true }).getAttribute('href'), 'mailto:test@gmail.com')
  console.log('Book email editor/save/public button and unused year omission with locked-year recovery passed.')
} finally { await browser.close() }
