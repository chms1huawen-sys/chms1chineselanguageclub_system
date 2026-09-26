import assert from 'node:assert/strict'
import { loadEnv } from 'vite'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const root = 'http://127.0.0.1:5173'
const env = loadEnv('development', process.cwd(), 'VITE_')
const storageKey = `sb-${new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`
const id = '10000000-0000-0000-0000-000000000001'
const user = { id, email: 'editor@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
const jwtPart = x => Buffer.from(JSON.stringify(x)).toString('base64url')
const token = `${jwtPart({ alg: 'HS256', typ: 'JWT' })}.${jwtPart({ sub: id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.fake-test-signature`
const session = { access_token: token, refresh_token: 'fake-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }
let role = 'advisor_teacher'
try {
  const context = await browser.newContext({ serviceWorkers: 'block' })
  context.setDefaultTimeout(10000)
  context.setDefaultNavigationTimeout(10000)
  await context.addInitScript(() => {
    localStorage.setItem('cls_tutorial_completed_zh', 'true')
    localStorage.setItem('cls_tutorial_completed_en', 'true')
  })
  await context.route('**/*.supabase.co/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data = []
    if (path.endsWith('/token')) data = session
    if (path.endsWith('/user')) data = user
    if (path.endsWith('/users')) data = { id, role, name: 'Test editor', is_active: true }
    if (path.endsWith('/blog_settings')) data = { title: '一中华文学会', subtitle: '古晋中华第一中学', intro: '我们的故事', hero_path: '/login-group-2026.jpeg' }
    if (path.endsWith('/blog_posts')) data = [{ id: 'post-1', slug: 'navigation', title: 'Navigation test', body: 'Public content', tags: [], summary: '', cover_path: '', status: 'published', version: 1 }]
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  const page = await context.newPage()
  await page.goto(root + '/blog/navigation')
  await page.getByRole('heading', { name: 'Navigation test', exact: true }).waitFor()
  await page.getByRole('link', { name: '会员登入', exact: true }).click()
  await page.getByPlaceholder('请输入电子邮箱').fill('editor@example.test')
  await page.getByPlaceholder('请输入密码').fill('not-a-real-password')
  await page.getByRole('button', { name: '立即登录' }).click()
  await page.waitForURL(root + '/blog/navigation')
  console.log('Login returned to article.')
  await page.getByRole('link', { name: '会员系统', exact: true }).first().waitFor()
  await page.getByRole('link', { name: '文章后台', exact: true }).click()
  await page.getByRole('heading', { name: '总览', exact: true }).waitFor()
  assert.equal(new URL(page.url()).pathname, '/blog-admin')
  assert.equal(await page.locator('.club-sidebar').count(), 0)
  console.log('Management page opened.')
  await page.getByRole('link', { name: '返回 Blog 首页', exact: true }).click()
  await page.getByRole('link', { name: '会员系统', exact: true }).first().waitFor()
  assert.equal(new URL(page.url()).hash, '')
  await page.goto(root + '/#/login')
  assert.equal(await page.getByPlaceholder('请输入电子邮箱').count(), 0)
  await page.locator('.club-sidebar').waitFor()
  assert.equal(await page.locator('.club-sidebar').getByText('文章后台', { exact: true }).count(), 0)
  await page.evaluate(key => localStorage.removeItem(key), storageKey)
  await page.goto(root + '/#/tasks')
  await page.reload()
  await page.getByPlaceholder('请输入电子邮箱').waitFor()
  role = 'ordinary_member'
  await page.evaluate(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: storageKey, session })
  await page.goto(root + '/blog-admin')
  await page.reload()
  await page.getByRole('heading', { name: '没有文章后台管理权限' }).waitFor()
  assert.equal(await page.getByRole('heading', { name: '总览', exact: true }).count(), 0)
  assert.equal(await page.locator('.club-sidebar').count(), 0)
  console.log('Real App routing: unchanged login, return to original article, authenticated Blog/backend switch, guest task login and ordinary-member backend denial passed.')
} finally { await browser.close() }
