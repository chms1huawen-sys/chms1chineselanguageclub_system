import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const root = 'http://127.0.0.1:5173'
const story = { id: 'story', slug: 'test-story', title: '第四届“传承”全校性华语诗歌朗诵比赛', summary: '记录舞台上的声音，留下共同成长的回忆。', body: '从准备到登台，每一次练习都是新的开始。\n\n在声音与文字之间，听见属于我们的故事。', credit: '华文学会媒体组', content_type: 'event', content_year: 2026, published_at: '2026-06-20T00:00:00Z', status: 'published', version: 1, cover_path: '/login-event-2026.jpeg', featured: true }
const media = [{ id: 'cover', post_id: 'story', path: story.cover_path, caption: '第四届“传承”比赛后的合影', position: 0 }, { id: 'group', post_id: 'story', path: '/login-group-2026.jpeg', caption: '一起记录学会的日常', position: 1 }]
const site = { id: 1, title: '一中华文学会', subtitle: '古晋中华第一中学', intro: '记录相聚的时刻，延续华文的温度。', hero_path: '/login-group-2026.jpeg', content: { hero_title: '古晋一中 · 华文学会', hero_slides: [{ path: '/logo-192.png', title: '小图展示', enabled: true }], hero_interval: 10 } }
let saved
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  context.setDefaultTimeout(10000)
  await context.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url()), table = url.pathname.split('/').at(-1)
    let data = []
    if (table === 'blog_settings') data = site
    if (table === 'blog_posts') data = [story, { ...story, id:'second', slug:'another-story', title:'学会里的相聚时光', cover_path:'/login-group-2026.jpeg' }]
    if (table === 'blog_media') data = media
    if (table === 'blog_studio_save') { saved = route.request().postDataJSON(); data = { ...saved.p_post, version: 2 } }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await mkdir('test-results/editorial', { recursive: true })
  for (const width of [1440, 390]) {
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto(root + '/tests/fixtures/blog.html')
    await page.getByRole('heading', { level: 1, name: '古晋一中 · 华文学会' }).waitFor().catch(async error => { console.error(errors, await page.locator('h1').allTextContents(), await page.locator('[role=alert]').allTextContents()); throw error })
    await page.getByRole('button', { name: '暂停', exact: true }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('.blog-showcase-photo img')].every(img => img.complete && img.naturalWidth))
    await page.waitForTimeout(700)
    const sizes = await page.locator('.blog-showcase-photo img').evaluateAll(images => images.map(img => ({ width: img.getBoundingClientRect().width, natural: img.naturalWidth })))
    assert.ok(sizes.every(img => img.width > 0), 'all Hero photos have visible dimensions')
    const heroBox = await page.locator('.blog-showcase-slides').boundingBox()
    assert.ok(heroBox.width > (width < 700 ? width * .8 : 1000), 'Hero keeps its full original container width')
    const titleBox = await page.getByRole('heading', { level: 1, name: '古晋一中 · 华文学会' }).boundingBox()
    assert.ok(titleBox.y >= heroBox.y && titleBox.y + titleBox.height <= heroBox.y + heroBox.height, 'headline overlays the photograph')
    const cards = page.locator('#articles .blog-post')
    const first = await cards.nth(0).boundingBox(), second = await cards.nth(1).boundingBox()
    if (width < 700) assert.ok(second.y >= first.y + first.height, 'mobile article cards have one column')
    assert.ok(await cards.first().evaluate(el => parseFloat(getComputedStyle(el).borderRadius)) >= 20)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `test-results/editorial/home-${width}.png`, fullPage: true })
    await page.getByRole('button', { name: '下一张', exact: true }).click()
    await page.getByRole('heading', { name: '小图展示', exact: true }).waitFor()
    const small = await page.locator('.blog-showcase-slide.is-active img').boundingBox()
    assert.ok(small.width >= heroBox.width - 2, 'reference Hero fills its frame even for small source photos')
    await page.goto(root + '/tests/fixtures/blog.html?mode=article')
    await page.locator('.blog-cover-figure img').waitFor()
    await page.waitForFunction(() => document.querySelector('.blog-cover-figure img')?.naturalWidth > 0)
    const image = await page.locator('.blog-cover-figure img').boundingBox()
    const caption = await page.locator('.blog-cover-figure figcaption').boundingBox()
    assert.ok(caption.y > image.y + image.height)
    assert.equal(await page.locator('.blog-cover-figure figcaption').textContent(), media[0].caption)
    assert.equal(await page.locator('.blog-gallery img').count(), 1, 'cover is not duplicated in the article gallery')
    await page.getByRole('button', { name: '查看封面大图', exact: true }).click()
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    assert.ok(await page.locator('.blog-cover-figure img').evaluate(el => parseFloat(getComputedStyle(el).borderRadius)) >= 20)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await page.screenshot({ path: `test-results/editorial/article-${width}.png`, fullPage: true })
    assert.deepEqual(errors, [])
    await page.close()
  }
  const admin = await context.newPage()
  await admin.goto(root + '/tests/fixtures/blog.html?mode=admin')
  await admin.getByRole('button', { name: '内容管理', exact: true }).click()
  await admin.getByRole('button', { name: '编辑', exact: true }).first().click()
  await admin.getByLabel('封面照片说明（显示在图片下方）', { exact: true }).fill('新的封面图片说明')
  await admin.getByRole('button', { name: '保存内容', exact: true }).click()
  await admin.getByRole('status').waitFor()
  assert.equal(saved.p_media.find(photo => photo.id === 'cover').caption, '新的封面图片说明')
  assert.equal(saved.p_post.credit, story.credit, 'cover caption does not overwrite byline')
  console.log('Responsive overlay Hero, full-bleed image scaling, mobile editorial cards, rounded captioned photos and caption persistence passed.')
} finally { await browser.close() }
