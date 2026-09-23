import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' })
const base = process.env.INVENTORY_TEST_URL || 'http://127.0.0.1:5173'
const output = process.env.INVENTORY_SCREENSHOTS || 'node_modules/.cache/inventory-screenshots'
await mkdir(output, { recursive: true })
const category = { id: 'c1', name: '文具', is_active: true }
const item = { id: 'i1', name: '活动用剪刀', category_id: 'c1', mode: 'loan', asset_code: null, unit: '把', location: '学会储藏室第二层', notes: '使用后请清洁并交还总务。', available: 8, reserved: 2, on_loan: 3, damaged: 1, lost: 0, is_active: true }
const request = { id: '22222222-2222-4222-8222-222222222222', applicant_id: '11111111-1111-4111-8111-111111111111', applicant_name: '测试会员', purpose: '筹备学会活动', pickup_date: '2026-09-23', due_date: '2026-09-30', status: 'pending', inventory_request_lines: [{id:'l1',item_id:'i1',item_name:item.name,quantity:2,returned:0,damaged:0,lost:0,mode:'loan'}] }
try {
  for (const [width, height, lang, role] of [[1440,1000,'zh','advisor_teacher'],[390,844,'zh','advisor_teacher'],[390,844,'en','ordinary_member']]) {
    const page = await browser.newPage({ viewport: { width, height } })
    const problems = []
    page.on('pageerror', e => problems.push(e.message))
    await page.route('**/*.supabase.co/**', async route => {
      const path = new URL(route.request().url()).pathname
      let data = []
      if (path.endsWith('/inventory_categories')) data = [category]
      if (path.endsWith('/inventory_items')) data = [item]
      if (path.endsWith('/inventory_requests')) data = [request]
      if (path.includes('/rpc/inventory_mutate')) data = { id: 'saved', notification_ids: [] }
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Content-Range': '0-0/0', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) })
    })
    await page.goto(`${base}/tests/fixtures/inventory.html?lang=${lang}&role=${role}`)
    await page.getByRole('heading', { name: '活动用剪刀' }).waitFor({ timeout: 10000 }).catch(async err => {
      console.error('UI errors:', problems)
      console.error('UI text:', await page.locator('body').innerText())
      throw err
    })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    if (role === 'ordinary_member') assert.equal(await page.getByRole('button', { name: 'Add item', exact: true }).count(), 0)
    await page.screenshot({ path: `${output}/${width}-${lang}-catalogue.png`, fullPage: true })
    await page.getByRole('button', { name: lang === 'zh' ? '申请' : 'Request', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    const bounds = await dialog.boundingBox()
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width)
    await dialog.getByLabel(lang === 'zh' ? '用途' : 'Purpose', { exact: true }).fill('Test activity')
    await dialog.getByLabel(lang === 'zh' ? '预计归还日期（借还物品必填）' : 'Return date (required for loans)', { exact: true }).fill('2099-09-30')
    await page.screenshot({ path: `${output}/${width}-${lang}-request.png`, fullPage: true })
    await dialog.getByRole('button', { name: lang === 'zh' ? '确认' : 'Confirm', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.ok((await page.evaluate(() => window.lastInventoryNotice))?.title)
    await page.getByRole('button', { name: lang === 'zh' ? '申请记录' : 'Requests', exact: true }).click()
    await page.getByRole('button', { name: /测试会员/ }).click()
    await dialog.waitFor()
    assert.equal(await dialog.getByRole('button', { name: lang === 'zh' ? '批准' : 'Approve', exact: true }).count(), role === 'ordinary_member' ? 0 : 1)
    await page.screenshot({ path: `${output}/${width}-${lang}-detail.png`, fullPage: true })
    await dialog.getByRole('button', { name: lang === 'zh' ? '关闭' : 'Close', exact: true }).click()
    if (role !== 'ordinary_member') {
      await page.getByRole('button', { name: '分类管理', exact: true }).click()
      await page.getByRole('button', { name: '新增分类', exact: true }).click()
      await dialog.getByLabel('分类名称', {exact:true}).fill('电器')
      await dialog.getByRole('button', { name: '确认', exact: true }).click()
      await dialog.waitFor({state:'hidden'})
    }
    assert.deepEqual(problems, [])
    await page.close()
  }
  console.log('Passed desktop/mobile layouts, Chinese/English forms, ordinary-member controls and submission feedback (mocked API).')
} finally { await browser.close() }
