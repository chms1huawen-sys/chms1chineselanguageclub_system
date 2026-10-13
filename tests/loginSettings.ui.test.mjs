import assert from 'node:assert/strict'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
try {
  const context = await browser.newContext({ serviceWorkers: 'block', reducedMotion: 'reduce' })
  let saved = null
  let fail = false
  await context.route('**/*.supabase.co/**', async route => {
    if (fail) return route.abort()
    const request = route.request()
    if (request.method() === 'PATCH') saved = request.postDataJSON()
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ content: saved?.content || {} }) })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('http://127.0.0.1:5173/tests/fixtures/login-settings.html?editor')
  const editor = page.locator('#member-login-settings')
  await editor.getByLabel('系统标题（中文）', { exact: true }).fill('自定义会员系统')
  await editor.getByLabel('系统简介（中文）', { exact: true }).fill('自定义简介')
  await editor.getByLabel('页脚文字（中文）', { exact: true }).fill('自定义页脚')
  await editor.getByLabel('照片主标题（中文）', { exact: true }).first().fill('自定义团体照')
  await editor.getByLabel('上方小字（中文）', { exact: true }).first().fill('自定义小字')
  await editor.getByLabel('照片主标题（英文）', { exact: true }).first().fill('Custom group photo')
  await editor.getByLabel('照片 1 后移', { exact: true }).click()
  assert.equal(await editor.getByLabel('照片主标题（中文）', { exact: true }).last().inputValue(), '自定义团体照')
  await editor.getByLabel('预览照片').selectOption('1')
  assert.equal(await editor.locator('.login-settings-caption strong').textContent(), '自定义团体照')
  await page.getByRole('button', { name: '保存网站设置', exact: true }).click()
  await page.waitForTimeout(200)
  assert.equal(saved.content.member_login.title, '自定义会员系统')
  assert.equal(saved.content.member_login.slides[1].title, '自定义团体照')
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    await editor.screenshot({ path: `${process.env.TEMP}/login-editor-${width}.png` })
  }
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('http://127.0.0.1:5173/tests/fixtures/login-settings.html')
    await page.getByRole('heading', { name: '自定义会员系统', exact: true }).waitFor()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.ok(await page.getByLabel('电子邮箱', { exact: true }).isVisible())
    await page.screenshot({ path: `${process.env.TEMP}/login-custom-${width}.png` })
    if (width === 1440) {
      await page.waitForFunction(() => document.querySelector('.login-carousel-slide-1 img')?.naturalWidth > 0)
      assert.equal(await page.locator('.login-carousel-slide-1').evaluate(el => getComputedStyle(el).opacity), '1')
      assert.equal(await page.locator('.login-carousel-slide-2 img').getAttribute('alt'), '自定义团体照')
      await page.getByRole('button', { name: '英文', exact: true }).click()
      assert.equal(await page.locator('.login-carousel-slide-2 img').getAttribute('alt'), 'Custom group photo')
    }
  }
  fail = true
  await page.reload()
  await page.getByRole('heading', { name: '古晋一中华文学会会员系统', exact: true }).waitFor()
  assert.deepEqual(errors, [])
  console.log('Login editor save/read, bilingual copy, order, preview, mobile/desktop, offline fallback passed.')
  await context.close()
} finally { await browser.close() }
