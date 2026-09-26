import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = process.env.BLOG_TEST_URL || 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const posts = [
  { id: 'p1', slug: 'test-story', title: '公开活动', body: '<script>window.unsafe=true</script>\n\n活动记录', status: 'published', content_type: 'event', content_year: 2026, category_id: 'c1', tags: ['诗歌'], related_ids: ['p3'], featured: true, cover_path: '/login-event-2026.jpeg' },
  { id: 'p2', slug: 'older', title: '早期活动', status: 'published', content_type: 'event', content_year: 2024, category_id: 'c1', tags: ['诗歌'] },
  { id: 'p3', slug: 'reading', title: '书坊文章', status: 'published', content_type: 'article', content_year: 2025, category_id: 'c2', tags: ['阅读'] },
]
let downloads = 0
let member = false
const requests = []
try {
  const context = await browser.newContext()
  context.setDefaultTimeout(10000)
  await context.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url()), table = url.pathname.split('/').at(-1)
    requests.push({ table, params: url.searchParams.toString() })
    let data = []
    if (table === 'blog_settings') data = { title: '一中华文学会', subtitle: '古晋中华第一中学', intro: '记录每一次相聚，留下属于我们的故事。', about: '在文字与生活之间，发现属于我们的故事。', hero_path: '/login-group-2026.jpeg', content: { hero_slides: [{ path: '/login-group-2026.jpeg', enabled: true }, { path: '/login-event-2026.jpeg', enabled: true }] } }
    if (table === 'blog_categories') data = [{ id: 'c1', name: '活动' }, { id: 'c2', name: '文学' }]
    if (table === 'blog_posts') { assert.equal(url.searchParams.get('status'), 'eq.published'); data = posts }
    if (table === 'blog_albums') data = ['活动相册', '舞台记忆', '校园时光', '相聚的我们'].map((title, index) => ({ id: `a${index + 1}`, title, status: 'published', content_year: 2026, cover_path: index % 2 ? '/login-event-2026.jpeg' : '/login-group-2026.jpeg' }))
    if (table === 'blog_post_albums') data = [{ album_id: 'a1' }]
    if (table === 'blog_media') data = [{ id: url.searchParams.has('post_id') ? 'legacy' : 'album-photo', path: '/login-event-2026.jpeg', caption: url.searchParams.has('post_id') ? '旧版照片' : '关联相册照片' }]
    if (table === 'blog_links') { if (!member) assert.equal(url.searchParams.get('visibility'), 'eq.public'); data = url.searchParams.get('visibility') === 'eq.member' ? [{ id: 'm1', visibility: 'member', url: 'https://example.com/member', label: '会员链接' }] : [{ id: 'l1', visibility: 'public', url: 'https://example.com', label: '公开链接' }, { id: 'l2', visibility: 'public', url: 'javascript:alert(1)', label: '不安全链接' }] }
    if (table === 'blog_downloads') { downloads++; data = { drive_url: 'https://drive.google.com/drive/folders/test' } }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await mkdir('test-results/public-journal', { recursive: true })
  for (const width of [1440, 390]) {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto(root + '/tests/fixtures/public-journal.html')
    await page.locator('#articles .blog-post').first().waitFor()
    assert.deepEqual(requests.slice(0, 1).map(item => item.table), ['blog_publish_due'])
    assert.equal(await page.locator('#articles .blog-post').count(), 3)
    await page.getByLabel('排序', { exact: true }).selectOption('asc')
    assert.equal(await page.locator('#articles .blog-post h3').first().textContent(), '早期活动')
    await page.getByLabel('标签', { exact: true }).selectOption('阅读')
    assert.equal(await page.locator('#articles .blog-post').count(), 1)
    await page.getByLabel('标签', { exact: true }).selectOption('')
    await page.getByLabel('年份', { exact: true }).selectOption('2026')
    assert.equal(await page.locator('#articles .blog-post').count(), 1)
    await page.getByLabel('年份', { exact: true }).selectOption('')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `test-results/public-journal/home-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: /活动相册/ }).click()
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('button', { name: /活动相册/ }).evaluate(el => el === document.activeElement), true)
    await page.goto(root + '/tests/fixtures/public-journal.html?mode=article')
    await page.getByRole('heading', { name: '公开活动', exact: true }).waitFor()
    await page.getByRole('button', { name: '关联相册照片', exact: true }).waitFor()
    assert.equal(await page.locator('.blog-gallery button').count(), 2)
    assert.equal(await page.getByRole('link', { name: '不安全链接' }).count(), 0)
    assert.equal(await page.evaluate(() => window.unsafe), undefined)
    assert.equal(await page.locator('.blog-public-section .blog-post h3').first().textContent(), '书坊文章')
    await page.getByRole('button', { name: '旧版照片' }).click()
    await page.keyboard.press('Shift+Tab')
    assert.equal(await page.getByRole('button', { name: '下一张', exact: true }).evaluate(el => el === document.activeElement), true)
    await page.keyboard.press('ArrowRight')
    assert.match(await page.locator('.blog-lightbox figcaption').textContent(), /关联相册照片/)
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('button', { name: '旧版照片' }).evaluate(el => el === document.activeElement), true)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `test-results/public-journal/article-${width}.png`, fullPage: true })
    assert.deepEqual(errors, [])
    await page.close()
  }
  assert.equal(downloads, 0)
  const page = await context.newPage()
  for (const [view, count] of [['activities', 2], ['bookroom', 1]]) {
    await page.goto(root + '/tests/fixtures/public-journal.html?view=' + view)
    await page.locator('#articles .blog-post').first().waitFor()
    assert.equal(await page.locator('#articles .blog-post').count(), count)
  }
  await page.goto(root + '/tests/fixtures/public-journal.html?view=about')
  await page.locator('.blog-community').getByRole('heading', { name: '一中华文学会', exact: true }).waitFor()
  member = true
  await page.goto(root + '/tests/fixtures/public-journal.html?mode=article&member=1')
  await page.getByRole('link', { name: /会员链接/ }).waitFor()
  await page.getByRole('button', { name: '取得原图相册' }).click()
  await page.getByRole('link', { name: '前往 Google Drive 下载' }).waitFor()
  assert.equal(downloads, 1)
  await page.close()
  console.log('Public journal desktop/mobile: published query, scheduler, filters, safe rendering, related priority, legacy + associated album photos, focus trap/restoration, guest isolation passed.')
} finally { await browser.close() }
