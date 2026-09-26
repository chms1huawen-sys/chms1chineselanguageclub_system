import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const root = process.env.BLOG_TEST_URL || 'http://127.0.0.1:5173'
const postId = '20000000-0000-0000-0000-000000000001'
const categoryId = '30000000-0000-0000-0000-000000000001'
const post = { id: postId, title: '第四届“传承”全校性华语诗歌朗诵比赛', slug: 'test-story', summary: '记录舞台上的声音，也记录我们一起努力的时光。', body: '相聚在华文的世界里。\n\n以诗会友，以声音传承文化。', category_id: categoryId, event_date: '2026-06-20', location: '学校礼堂', tags: ['传承', '诗歌'], credit: '华文学会媒体组', cover_path: '/login-event-2026.jpeg', status: 'published', featured: true, version: 1, published_at: '2026-06-21T00:00:00Z', updated_at: '2026-06-21T00:00:00Z' }
const settings = { id: 1, title: '一中华文学会', subtitle: '古晋中华第一中学', intro: '记录相聚的时刻，延续华文的温度。', about: '在文字与生活之间，发现属于我们的故事。', contact: '古晋中华第一中学 · 华文学会', hero_path: '/login-group-2026.jpeg' }
const media = [{ id: 'photo1', post_id: postId, path: '/login-group-2026.jpeg', caption: '我们的合照', position: 0 }]
let driveRequests = 0, saved = null
try {
  const context = await browser.newContext()
  await context.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url())
    const table = url.pathname.split('/').at(-1)
    const method = route.request().method()
    let data = []
    if (table === 'blog_settings') data = settings
    if (table === 'blog_categories') data = [{ id: categoryId, name: '学会活动' }]
    if (table === 'blog_posts') data = [{ ...post, content_year: 2026, content_type: 'event' }]
    if (table === 'blog_media') data = media
    if (table === 'blog_analytics_report') data = { views: 12, visitors: 6, sessions: 8, daily: [{ date: '2026-09-25', views: 12, visitors: 6 }], pages: [{ path: '/', views: 12, visitors: 6 }], sources: [{ source: '(direct)', views: 12 }], recent: [{ visited_at: '2026-09-25T04:00:00Z', path: '/', source: '(direct)', device: 'mobile' }] }
    if (table === 'blog_downloads') { driveRequests++; data = { drive_url: 'https://drive.google.com/drive/folders/members-only-originals' } }
    if (table === 'blog_studio_save') { saved = route.request().postDataJSON(); data = { ...post, ...saved.p_post, id: postId, version: 2 } }
    if (method === 'PATCH') data = []
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await mkdir('test-results/blog', { recursive: true })
  for (const width of [1440, 390]) {
    const page = await context.newPage()
    await page.setViewportSize({ width, height: 900 })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(root + '/tests/fixtures/blog.html')
    await page.locator('.blog-post').first().waitFor()
    await page.locator('img').evaluateAll(images => images.forEach(img => { img.loading = 'eager' }))
    await page.waitForFunction(() => [...document.images].every(img => img.complete && img.naturalWidth > 0))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `test-results/blog/home-${width}.png`, fullPage: true })
    await page.getByRole('searchbox', { name: '搜索公开文章和书籍', exact: true }).fill('不存在')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.getByText('暂无符合条件的公开文章。').waitFor()
    await page.goto(root + '/tests/fixtures/blog.html?mode=article')
    await page.getByRole('heading', { level: 1, name: post.title }).waitFor()
    assert.equal(driveRequests, 0)
    assert.equal(await page.locator('a[href*="drive.google.com"]').count(), 0)
    await page.getByRole('button', { name: '我们的合照' }).click()
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').count(), 0)
    await page.screenshot({ path: `test-results/blog/article-${width}.png`, fullPage: true })
    assert.deepEqual(errors, [])
    await page.close()
  }
  const page = await context.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(root + '/tests/fixtures/blog.html?mode=article&member=1')
  await page.getByRole('button', { name: '取得原图相册' }).click()
  await page.getByRole('link', { name: '前往 Google Drive 下载' }).waitFor()
  assert.equal(driveRequests, 1)
  await page.goto(root + '/tests/fixtures/blog.html?mode=admin')
  await page.getByRole('button', { name: '内容管理', exact: true }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByLabel('标题', { exact: true }).fill('新的活动文章')
  await page.getByRole('button', { name: '保存内容' }).click()
  await page.getByRole('status').waitFor()
  assert.equal(saved.p_post.title, '新的活动文章')
  assert.equal(saved.p_version, 1)
  assert.ok(Array.isArray(saved.p_links))
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  await page.screenshot({ path: 'test-results/blog/editor-mobile.png', fullPage: true })
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.getByRole('heading', { name: '新的活动文章', exact: true }).waitFor()
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(root + '/tests/fixtures/blog.html?mode=admin')
    await page.getByRole('heading', { name: '总览', exact: true }).waitFor()
    await page.screenshot({ path: `test-results/blog/studio-${width}.png`, fullPage: true })
    for (const name of ['访问统计', '网站设置', '分类与标签', '活动记录', '回收站']) {
      await page.getByRole('button', { name, exact: true }).click()
      await page.getByRole('heading', { name, exact: true }).first().waitFor()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name)
      if (name === '访问统计') {
        await page.getByText('12', { exact: true }).first().waitFor()
        await page.screenshot({ path: `test-results/blog/analytics-${width}.png`, fullPage: true })
      }
    }
  }
  await page.close()
  console.log('Public home/article desktop & mobile, search, photos, guest isolation, member album retrieval, editor save/preview and layout passed.')
} finally { await browser.close() }
