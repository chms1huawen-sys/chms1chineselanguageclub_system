import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const root = 'http://127.0.0.1:5173'
const site = { id: 1, title: '一中华文学会', subtitle: '古晋中华第一中学', intro: '记录相聚的时刻', about: '关于我们详细历史，独立于首页的完整介绍。', hero_path: '/login-group-2026.jpeg', content: {
  hero_title: '古晋一中 · 华文学会', hero_subtitle: '默认介绍副标题', hero_cta: '走进学会', hero_link: '/about', hero_interval: 3,
  hero_slides: [{ path: '/login-event-2026.jpeg', title: '传承朗诵比赛', link: '/activities', enabled: true }],
  about_notes: '首页简短故事。', stats_start_year: 1975, stats_members: 88,
  stats_posts_label: '我们的文章', stats_members_label: '学会成员', stats_years_label: '传承年数', submission_note: '欢迎向编辑投稿。',
} }
const posts = [
  { id: '1', slug: 'article', title: '文字记录', body: '河流的故事', status: 'published', content_type: 'article', content_year: 2026 },
  { id: '2', slug: 'book', title: '书籍资料', body: '作品介绍', book_details: { author: '黄作者', isbn: '12345' }, status: 'published', content_type: 'publication', content_year: 2026 },
]
let saved
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  context.setDefaultTimeout(12000)
  await context.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url()), table = url.pathname.split('/').at(-1)
    let data = []
    if (table === 'blog_settings') {
      if (route.request().method() === 'PATCH') { saved = route.request().postDataJSON(); data = { ...site, ...saved } }
      else data = site
    }
    if (table === 'blog_posts') {
      assert.equal(url.searchParams.get('status'), 'eq.published')
      data = posts
    }
    if (table === 'blog_years') data = [{ year: 2026, is_archived: false }]
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await mkdir('test-results/presentation', { recursive: true })
  for (const width of [1440, 390]) {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto(root)
    await page.getByRole('heading', { name: site.content.hero_title, exact: true }).waitFor()
    await page.getByRole('button', { name: '不允许', exact: true }).click().catch(() => {})
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('.blog-showcase-photo img')].every(img => img.complete && img.naturalWidth > 0))
    assert.equal(await page.locator('.blog-showcase-slide').count(), 2)
    assert.equal(await page.locator('.blog-global-search').count(), 1)
    assert.equal(await page.locator('.blog-main input[type=search]').count(), 0)
    assert.equal(await page.locator('.blog-community-counts dd').allTextContents().then(values => values.join(',')), '2,88,51')
    assert.ok((await page.locator('.blog-community-counts').textContent()).includes('1975–2026'))
    assert.ok((await page.locator('.blog-community-board').textContent()).includes('首页简短故事'))
    assert.ok(!(await page.locator('.blog-community-board').textContent()).includes('详细历史'))
    assert.equal(await page.locator('.blog-showcase-photo img').first().evaluate(img => getComputedStyle(img).objectFit), 'scale-down')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `test-results/presentation/home-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: '下一张', exact: true }).click()
    await page.waitForTimeout(180)
    const opacity = await page.locator('.blog-showcase-slide').evaluateAll(slides => slides.map(slide => Number(getComputedStyle(slide).opacity)))
    assert.ok(opacity.every(value => value > 0 && value < 1), 'both photos participate in the crossfade')
    await page.getByRole('heading', { name: '传承朗诵比赛', exact: true }).waitFor()
    await page.getByRole('button', { name: '下一张', exact: true }).click()
    await page.getByRole('heading', { name: site.content.hero_title, exact: true }).waitFor()
    await page.goto(root + '/about')
    await page.getByText(site.about, { exact: true }).waitFor()
    assert.equal(await page.getByText('首页简短故事。', { exact: true }).count(), 0)
    await page.goto(root + '/literature')
    await page.getByText('欢迎向编辑投稿。').waitFor()
    await page.getByRole('searchbox').fill('黄作者')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.locator('#articles .blog-post').first().waitFor()
    assert.equal(await page.locator('#articles .blog-post h3').textContent(), '书籍资料')
    assert.equal(await page.locator('.blog-showcase').count(), 0)
    await page.getByRole('searchbox').fill('河流')
    await page.getByRole('button', { name: '搜索', exact: true }).click()
    await page.locator('#articles .blog-post').first().waitFor()
    assert.equal(await page.locator('#articles .blog-post h3').textContent(), '文字记录')
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(251, 253, 255)')
    await page.screenshot({ path: `test-results/presentation/search-${width}.png`, fullPage: true })
    assert.deepEqual(errors, [])
    await page.close()
  }
  // Admin reads may include drafts; the public-only assertion above is intentionally removed for the editor.
  await context.unroute('**/*.supabase.co/**')
  await context.route('**/*.supabase.co/**', async route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    let data = []
    if (table === 'blog_settings') {
      if (route.request().method() === 'PATCH') saved = route.request().postDataJSON()
      data = { ...site, ...saved }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  const admin = await context.newPage()
  await admin.setViewportSize({ width: 390, height: 900 })
  await admin.goto(root + '/tests/fixtures/blog.html?mode=admin')
  await admin.getByRole('button', { name: '网站设置', exact: true }).click()
  await admin.getByLabel('现今团员人数', { exact: true }).fill('99')
  await admin.getByLabel('记录开始年份', { exact: true }).fill('1976')
  await admin.getByLabel('公开文章卡片名称', { exact: true }).fill('公开内容')
  await admin.getByLabel(/关于我们页面：详细介绍/).fill('新的完整介绍')
  await admin.getByLabel('默认首页画面主标题', { exact: true }).fill('新的默认标题')
  await admin.getByLabel('探索按钮文字（轮播默认）', { exact: true }).fill('查看更多')
  await admin.getByLabel(/中文投稿提示/).fill('新的投稿提示')
  await admin.getByRole('button', { name: '保存网站设置', exact: true }).click()
  await admin.getByRole('status').waitFor()
  assert.equal(saved.content.stats_members, '99')
  assert.equal(saved.content.hero_title, '新的默认标题')
  assert.equal(saved.content.submission_note, '新的投稿提示')
  assert.equal(saved.about, '新的完整介绍')
  assert.equal(saved.content.about_notes, '首页简短故事。')
  assert.equal(await admin.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
  console.log('Desktop/mobile: editable statistics, summary/detail separation, default slide, crossfade, global article/book search, light footer and CMS persistence passed.')
} finally { await browser.close() }
