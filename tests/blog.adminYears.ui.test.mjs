import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const page = await browser.newPage()
  const year = new Date().getFullYear()
  const book = { id: 'book', title: 'Earlier edition', slug: 'earlier-edition', content_type: 'publication', content_year: 1999, book_details: { published_on: '1999-01-01' }, published_at: `${year}-03-01T00:00:00Z`, status: 'published' }
  await page.route('**/*.supabase.co/**', async route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    const data = table === 'blog_posts' ? [book, { ...book, id: 'draft', title: 'Unpublished book', published_at: null, status: 'draft' }] : table === 'blog_settings' ? { title: 'Club', content: {} } : []
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html?mode=admin')
  await page.getByRole('button', { name: '书坊管理', exact: true }).click()
  await page.getByRole('button', { name: 'Earlier edition', exact: true }).waitFor()
  const select = page.getByRole('combobox', { name: '管理年份' })
  assert.deepEqual(await select.locator('option').allTextContents(), ['全部年份', '尚未发布', String(year)])
  assert.equal(await page.locator('tbody tr').first().locator('td').nth(3).textContent(), String(year))
  assert.equal(await page.getByRole('button', { name: 'Unpublished book', exact: true }).count(), 0)
  await select.selectOption('unpublished')
  await page.getByRole('button', { name: 'Unpublished book', exact: true }).waitFor()
  assert.equal(await page.locator('tbody tr').first().locator('td').nth(3).textContent(), '尚未发布')
  await select.selectOption('')
  assert.equal(await page.locator('tbody tr').count(), 2)
  console.log('Book administration uses website publication year, not edition/archive year; unpublished records remain accessible.')
} finally { await browser.close() }
