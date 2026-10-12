import assert from 'node:assert/strict'
import { adminTagIds } from '../src/utils/blogAdminTags.js'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const year = new Date().getFullYear()
let tagName = '旧标签'
let posts = ['published', 'draft', 'scheduled', 'hidden', 'review', 'trash'].map((status, i) => ({ id: `p${i}`, title: `Record ${status}`, slug: `record-${status}`, status, content_type: 'article', content_year: year, published_at: status === 'published' ? `${year}-01-01T00:00:00Z` : null, tag_ids: i === 1 ? [] : ['tag'], tags: i === 1 ? [tagName] : [], updated_at: `${year}-01-01T00:00:00Z`, body: 'Test', category_id: 'category' }))
let saved
assert.deepEqual(adminTagIds({ tag_ids: [], tags: ['旧标签'] }, [{ id: 'tag', name: '旧标签' }]), ['tag'])
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  await context.route('**/*.supabase.co/**', route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    let data = []
    if (table === 'blog_posts') data = posts
    if (table === 'blog_settings') data = { title: '一中华文学会', content: {} }
    if (table === 'blog_tags') data = [{ id: 'tag', name: tagName, is_visible: true }]
    if (table === 'blog_categories') data = [{ id: 'category', name: '分类', section: 'article' }]
    if (table === 'blog_studio_save') { saved = route.request().postDataJSON().p_post; data = saved }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) })
  })
  const page = await context.newPage()
  await page.goto('http://127.0.0.1:5173/tests/fixtures/blog.html?mode=admin')
  await page.getByRole('heading', { name: '总览', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Record draft', exact: true }).waitFor()
  assert.equal(await page.locator('.bs-stats > div').nth(2).locator('strong').textContent(), '2')
  await page.getByRole('button', { name: '内容管理', exact: true }).click()
  assert.equal(await page.getByRole('combobox', { name: '管理年份' }).inputValue(), '')
  assert.equal(await page.locator('tbody tr').count(), 5)
  await page.getByRole('combobox', { name: '标签', exact: true }).selectOption('tag')
  assert.equal(await page.locator('tbody tr').count(), 5, 'legacy and stable tag formats are both filterable')
  for (const status of ['draft', 'scheduled', 'hidden', 'published']) {
    await page.getByRole('combobox', { name: '状态', exact: true }).selectOption(status)
    assert.equal(await page.locator('tbody tr').count(), status === 'draft' ? 2 : 1)
  }
  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('')
  await page.getByRole('combobox', { name: '管理年份' }).selectOption(String(year))
  assert.equal(await page.locator('tbody tr').count(), 1)
  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('draft')
  assert.equal(await page.getByRole('combobox', { name: '管理年份' }).inputValue(), '')
  await page.getByRole('button', { name: 'Record draft', exact: true }).click()
  assert.equal(await page.getByLabel('旧标签', { exact: true }).isChecked(), true)
  await page.getByLabel('旧标签', { exact: true }).uncheck()
  await page.getByRole('button', { name: '保存内容', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '内容、链接与照片说明已保存' }).waitFor()
  assert.deepEqual(saved.tags, [])
  assert.deepEqual(saved.tag_ids, [])
  await page.getByRole('button', { name: '返回列表', exact: true }).click()
  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('')
  posts = posts.map(p => ({ ...p, title: p.title === 'Record published' ? 'Database changed title' : p.title, tag_ids: ['tag'] }))
  tagName = '更新后的标签'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.getByRole('button', { name: 'Database changed title', exact: true }).waitFor()
  await page.getByRole('combobox', { name: '标签', exact: true }).getByRole('option', { name: tagName, exact: true }).waitFor({ state: 'attached' })
  await page.getByRole('button', { name: '回收站', exact: true }).click()
  await page.getByRole('button', { name: 'Record trash', exact: true }).waitFor()
  console.log('All-year defaults, draft/scheduled/hidden/review/trash visibility, legacy tags, tag removal and focus refresh passed.')
} finally { await browser.close() }
