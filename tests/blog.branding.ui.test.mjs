import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const root = 'http://127.0.0.1:5173'
let site = { title: '自定义华文学会', subtitle: '学校名称', intro: '自定义简介', content: {} }
let releaseSettings
let holdSettings = true
const settingsGate = new Promise(resolve => { releaseSettings = resolve })
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  context.setDefaultTimeout(12000)
  await context.addInitScript(() => {
    window.staleBrandSeen = false
    new MutationObserver(() => {
      if (document.querySelector('.blog-brand')?.textContent.includes('一中华文学会')) window.staleBrandSeen = true
    }).observe(document, { childList: true, subtree: true, characterData: true })
  })
  await context.route('**/*.supabase.co/**', async route => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1)
    let data = []
    if (table === 'blog_settings') {
      if (holdSettings) await settingsGate
      if (route.request().method() === 'PATCH') site = { ...site, ...route.request().postDataJSON() }
      await new Promise(resolve => setTimeout(resolve, 700))
      data = site
    }
    if (table === 'blog_posts') await new Promise(resolve => setTimeout(resolve, 1200))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  const page = await context.newPage()
  await page.goto(root, { waitUntil: 'domcontentloaded' })
  await page.getByRole('status', { name: '载入网站名称' }).waitFor()
  assert.equal(await page.locator('.blog-showcase').count(), 0, 'no default-photo flash')
  holdSettings = false
  releaseSettings()
  await page.locator('.blog-brand').filter({ hasText: site.title }).waitFor()
  assert.ok((await page.title()).includes(site.title))
  assert.equal(await page.evaluate(() => window.staleBrandSeen), false)
  // Production HTML carries fresh public settings, avoiding a fallback between SSR and React.
  await page.route(root + '/', async route => {
    const response = await route.fetch()
    const html = (await response.text()).replace('</head>', '<script id="blog-site-settings" type="application/json">' + JSON.stringify(site) + '</script></head>')
    await route.fulfill({ response, body: html })
  })
  await page.goto(root)
  await page.locator('.blog-brand').filter({ hasText: site.title }).waitFor()
  assert.equal(await page.getByRole('status', { name: '载入网站名称' }).count(), 0)
  assert.equal(await page.evaluate(() => window.staleBrandSeen), false)
  await page.goto(root + '/tests/fixtures/blog.html?mode=shell')
  await page.locator('.blog-admin-shell .blog-brand').filter({ hasText: site.title }).waitFor()
  await page.getByRole('button', { name: '网站设置', exact: true }).click()
  await page.getByLabel(/网站标题/).fill('更新后的学会名称')
  await page.getByRole('button', { name: '保存网站设置', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '已保存' }).waitFor()
  await page.locator('.blog-brand').filter({ hasText: '更新后的学会名称' }).waitFor()
  assert.ok((await page.locator('.bs-sidebar-title').textContent()).includes('更新后的学会名称'))
  assert.ok((await page.title()).includes('更新后的学会名称'))
  assert.equal(await page.evaluate(() => window.staleBrandSeen), false)
  console.log('Delayed settings, production bootstrap and admin save: no old-brand flash; header/sidebar/tab titles stay synchronized.')
} finally { await browser.close() }
