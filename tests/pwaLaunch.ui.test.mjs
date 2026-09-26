import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const root = 'http://127.0.0.1:5173'
try {
  for (const mode of ['browser', 'android', 'ios']) {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } })
    await context.addInitScript(mode => {
      if (mode === 'ios') Object.defineProperty(navigator, 'standalone', { value: true })
      if (mode === 'android') {
        const original = window.matchMedia.bind(window)
        window.matchMedia = query => query === '(display-mode: standalone)' ? { ...original(query), matches: true } : original(query)
      }
    }, mode)
    await context.route('**/*.supabase.co/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
    const page = await context.newPage()
    await page.goto(root)
    if (mode === 'browser') {
      await page.locator('.blog-nav').waitFor()
      assert.equal(new URL(page.url()).hash, '')
    } else {
      await page.getByPlaceholder('请输入电子邮箱').waitFor()
      assert.equal(new URL(page.url()).hash, '#/')
    }
    await page.goto(root + '/?view=blog')
    await page.locator('.blog-nav').waitFor()
    await page.locator('.blog-brand').click()
    await page.locator('.blog-nav').waitFor()
    assert.equal(new URL(page.url()).hash, '')
    await page.getByRole('link', { name: '安装 Blog 首页', exact: true }).click()
    await page.locator('.blog-nav').waitFor()
    assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/manifest-blog.json')
    const manifest = await (await context.request.get(root + '/manifest-blog.json')).json()
    assert.equal(manifest.start_url, '/?app=blog')
    await page.goto(root + '/#/tasks')
    await page.getByPlaceholder('请输入电子邮箱').waitFor()
    assert.equal(new URL(page.url()).hash, '#/tasks')
    assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'), '/manifest.json')
    await context.close()
    console.log(`${mode}: member launch, explicit Blog navigation, separate manifest and task deep link passed.`)
  }
} finally { await browser.close() }
