import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const root = 'http://127.0.0.1:5173'
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const posts = [
  { id: 'event', title: '学会活动测试', slug: 'event', content_type: 'event', content_year: 2026, category_id: 'event-cat', status: 'published', featured: true, show_in_moments: true, cover_path: '/login-group-2026.jpeg', body: '活动正文', tag_ids: ['tag'] },
  { id: 'news', title: '招新资讯测试', slug: 'news', content_type: 'notice', content_year: 2026, status: 'published', body: '资讯正文' },
  { id: 'article', title: '文学创作测试', slug: 'literature', content_type: 'article', content_year: 2026, category_id: 'child', status: 'published', body: '文'.repeat(500), tag_ids: ['tag'] },
  { id: 'book', title: '书籍测试', slug: 'book', content_type: 'publication', content_year: 2026, category_id: 'books', status: 'published', body: '书籍介绍', book_details: { author: '作者测试', price: 'RM 20', pages: '120', isbn: '12345', purchase_links: [{ platform: 'instagram', label: '购买联系', url: 'https://www.instagram.com/example/' }] } },
]
const categories = [
  { id: 'event-cat', name: '日常活动', section: 'event', is_visible: true },
  { id: 'parent', name: '文学创作', section: 'article', is_visible: true },
  { id: 'child', parent_id: 'parent', name: '诗歌', section: 'article', is_visible: true },
  { id: 'hidden', name: '不可见分类', section: 'article', is_visible: false },
  { id: 'books', name: '学会出版', section: 'publication', is_visible: true },
]
const site = { title: '一中华文学会', subtitle: '古晋中华第一中学', intro: '记录现在，传承以后。', about: '关于我们', content: { hero_slides: [{ enabled: true, path: '/login-group-2026.jpeg', title: '介绍通道', subtitle: '学会资讯', link: '/news' }], social_links: [{ label: 'Instagram', platform: 'instagram', url: 'https://www.instagram.com/example/' }] } }
let lastSave
let taxonomySave
let settingsSave
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  context.setDefaultTimeout(10000)
  await context.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url()), table = url.pathname.split('/').at(-1)
    let data = []
    if (table === 'blog_posts') data = posts
    if (table === 'blog_settings') {
      if (route.request().method() === 'PATCH') { settingsSave = route.request().postDataJSON(); data = { ...site, ...settingsSave } } else data = site
    }
    if (table === 'blog_categories') { if (route.request().method() === 'POST' || route.request().method() === 'PATCH') taxonomySave = route.request().postDataJSON(); data = categories }
    if (table === 'blog_tags') data = [{ id: 'tag', name: '改名后的标签', icon: '✍', color: '#28688e', is_visible: true }]
    if (table === 'blog_years') data = [{ year: 2026, is_archived: false }]
    if (table === 'blog_media') data = url.searchParams.get('post_id') === 'eq.event' ? [{ id: 'photo', post_id: 'event', path: '/login-event-2026.jpeg', caption: '活动照片' }] : []
    if (table === 'blog_studio_save') { lastSave = route.request().postDataJSON(); data = { ...lastSave.p_post, id: 'saved', version: 1 } }
    assert.notEqual(table, 'blog_albums', 'independent albums are no longer queried')
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await mkdir('test-results/culture', { recursive: true })
  for (const width of process.env.ADMIN_ONLY ? [] : [1440, 390]) {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto(root)
    await page.getByRole('heading', { name: '一中华文学会', level: 1, exact: true }).waitFor()
    await page.getByRole('button', { name: '下一张', exact: true }).click()
    await page.getByRole('heading', { name: '介绍通道', exact: true }).waitFor()
    await page.locator('#articles .blog-post').first().waitFor()
    assert.equal(await page.locator('#articles').getByText('招新资讯测试', { exact: true }).count(), 1)
    assert.equal(await page.locator('.blog-showcase-slide.is-active .blog-showcase-photo').getAttribute('href'), '/news')
    assert.equal(await page.locator('.blog-album').first().getAttribute('href'), '/blog/event')
    assert.equal(await page.locator('.blog-footer').getByRole('link', { name: 'Instagram', exact: true }).count(), 1)
    await page.getByRole('button', { name: '不允许', exact: true }).click().catch(() => {})
    await page.locator('.blog-album img').first().scrollIntoViewIfNeeded()
    await page.waitForFunction(() => [...document.querySelectorAll('.blog-album img')].every(img => img.complete && img.naturalWidth > 0 && img.getBoundingClientRect().height > 100))
    await page.evaluate(() => window.scrollTo(0, 0))
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `test-results/culture/home-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: '文学角落分类', exact: true }).click()
    await page.locator('#menu-article.is-open').waitFor()
    assert.equal(await page.locator('#menu-article').getByText('不可见分类').count(), 0)
    await page.locator('#menu-article').getByRole('link', { name: '文学创作', exact: true }).click()
    await page.locator('#articles .blog-post').first().waitFor()
    assert.equal(await page.locator('#articles .blog-post').count(), 1)
    assert.equal(await page.locator('#articles .blog-post h3').textContent(), '文学创作测试')
    await page.goto(root + '/bookroom')
    await page.locator('#articles .blog-post').first().waitFor()
    assert.equal(await page.locator('#articles .blog-post').count(), 1)
    await page.locator('#articles .blog-post').click()
    await page.getByRole('heading', { name: '书籍测试', exact: true }).waitFor()
    assert.equal(await page.getByRole('link', { name: '购买联系', exact: true }).getAttribute('href'), 'https://www.instagram.com/example/')
    assert.equal(await page.getByRole('heading', { name: '活动原图相册' }).count(), 0)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `test-results/culture/book-${width}.png`, fullPage: true })
    await page.goto(root + '/news')
    await page.locator('#articles .blog-post').first().waitFor()
    assert.equal(await page.locator('#articles .blog-post h3').textContent(), '招新资讯测试')
    await page.goto(root + '/blog/literature')
    await page.getByRole('heading', { name: '文学创作测试' }).waitFor()
    assert.equal(await page.locator('.blog-tags').getByText('改名后的标签', { exact: false }).count(), 1)
    assert.deepEqual(errors, [])
    await page.close()
  }
  const page = await context.newPage()
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(root + '/tests/fixtures/blog.html?mode=admin')
  await page.getByRole('heading', { name: '总览', exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '独立相册', exact: true }).count(), 0)
  await page.getByRole('button', { name: '书坊管理', exact: true }).click()
  await page.getByRole('button', { name: '新增内容', exact: true }).click()
  await page.getByLabel('作者', { exact: true }).fill('新作者')
  await page.getByLabel('价格（例如 RM 20）', { exact: true }).fill('RM 30')
  await page.getByLabel('标题', { exact: true }).fill('新书')
  await page.getByRole('button', { name: '保存内容', exact: true }).click()
  await page.getByRole('status').waitFor()
  assert.equal(lastSave.p_post.book_details.author, '新作者')
  assert.equal(lastSave.p_post.content_type, 'publication')
  assert.deepEqual(lastSave.p_album_ids, [])
  await page.getByRole('button', { name: '分类与标签', exact: true }).click()
  await page.getByLabel('名称', { exact: true }).fill('新分类')
  await page.getByLabel('栏目', { exact: true }).selectOption('event')
  await page.getByLabel('排序（小的排前面）', { exact: true }).fill('3')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('status').waitFor()
  assert.equal(taxonomySave.section, 'event')
  assert.equal(taxonomySave.position, 3)
  await page.getByRole('button', { name: '网站设置', exact: true }).click()
  await page.getByLabel('名称', { exact: true }).first().fill('学会 IG')
  await page.getByRole('button', { name: '保存网站设置', exact: true }).click()
  await page.getByRole('status').waitFor()
  assert.equal(settingsSave.content.social_links[0].label, '学会 IG')
  await page.screenshot({ path: 'test-results/culture/settings-desktop.png', fullPage: true })
  console.log('Public desktop/mobile navigation, news, Hero, article moments, book links, stable tags and CMS book/category/social save passed.')
} finally { await browser.close() }
