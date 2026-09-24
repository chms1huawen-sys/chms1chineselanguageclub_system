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
    let submissions = 0
    let operationId
    const secondItem = { ...item, id: 'i2', name: '绘画纸', mode: 'consumable', available: 20 }
    page.on('pageerror', e => problems.push(e.message))
    await page.route('**/*.supabase.co/**', async route => {
      const path = new URL(route.request().url()).pathname
      let data = []
      if (path.endsWith('/inventory_categories')) data = [category]
      if (path.endsWith('/inventory_items')) data = [item, secondItem]
      if (path.endsWith('/inventory_requests')) data = [request]
      if (path.includes('/rpc/inventory_mutate')) {
        const body = route.request().postDataJSON()
        if (body.p_action === 'submit') {
          assert.deepEqual(body.p_data.lines, [{item_id:'i1',quantity:2},{item_id:'i2',quantity:1}])
          submissions++
          if (submissions === 1) {
            operationId=body.p_data.operation_id
            return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Temporary test error'})})
          }
          assert.equal(body.p_data.operation_id,operationId)
        }
        data = { id: 'saved', notification_ids: [] }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Content-Range': '0-0/0', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(data) })
    })
    await page.goto(`${base}/tests/fixtures/inventory.html?lang=${lang}&role=${role}`)
    await page.getByRole('heading', { name: '活动用剪刀' }).waitFor({ timeout: 10000 }).catch(async err => {
      console.error('UI errors:', problems)
      console.error('UI text:', await page.locator('body').innerText())
      throw err
    })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    assert.equal(await page.getByRole('button', { name: lang === 'zh' ? '新增物品' : 'Add item', exact: true }).count(), 0)
    assert.equal(await page.getByRole('link', { name: lang === 'zh' ? '物品管理' : 'Manage inventory', exact: true }).count(), role === 'ordinary_member' ? 0 : 1)
    await page.screenshot({ path: `${output}/${width}-${lang}-catalogue.png`, fullPage: true })
    const addName=lang==='zh'?'加入清单':'Add to list'
    await page.locator('.inv-item').filter({has:page.getByRole('heading',{name:'活动用剪刀'})}).getByRole('button',{name:addName,exact:true}).click()
    await page.getByRole('button',{name:lang==='zh'?'增加 活动用剪刀':'Increase 活动用剪刀',exact:true}).click()
    await page.locator('.inv-item').filter({has:page.getByRole('heading',{name:'绘画纸'})}).getByRole('button',{name:addName,exact:true}).click()
    assert.equal(submissions,0)
    await page.getByRole('button', { name: lang === 'zh' ? '查看清单并申请' : 'Review and request', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.waitFor()
    const bounds = await dialog.boundingBox()
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width)
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= height)
    await dialog.getByLabel(lang === 'zh' ? '用途' : 'Purpose', { exact: true }).fill('Test activity')
    const quantity=dialog.getByLabel(lang==='zh'?'活动用剪刀 数量':'活动用剪刀 Quantity',{exact:true})
    await quantity.fill('99')
    assert.equal(await dialog.getByRole('button',{name:lang==='zh'?'确认':'Confirm',exact:true}).isDisabled(),true)
    await quantity.fill('2')
    await dialog.getByRole('button',{name:lang==='zh'?'继续选择物品':'Continue browsing',exact:true}).click()
    await dialog.waitFor({state:'hidden'})
    await page.getByRole('button',{name:lang==='zh'?'查看清单并申请':'Review and request',exact:true}).click()
    await dialog.waitFor({timeout:5000}).catch(async err=>{console.error(problems,await page.locator('body').innerText());throw err})
    assert.equal(await dialog.getByLabel(lang==='zh'?'用途':'Purpose',{exact:true}).inputValue(),'Test activity')
    assert.equal(await dialog.locator('.inv-cart-line').count(),2)
    await dialog.getByLabel(lang === 'zh' ? '预计归还日期（借还物品必填）' : 'Return date (required for loans)', { exact: true }).fill('2099-09-30')
    await page.screenshot({ path: `${output}/${width}-${lang}-request.png`, fullPage: true })
    await dialog.getByRole('button', { name: lang === 'zh' ? '确认' : 'Confirm', exact: true }).click()
    await dialog.getByRole('alert').filter({hasText:'Temporary test error'}).waitFor()
    assert.equal(await dialog.locator('.inv-cart-line').count(),2)
    await dialog.getByRole('button', { name: lang === 'zh' ? '确认' : 'Confirm', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await page.locator('.inv-cart-bar').count(),0)
    assert.equal(submissions,2)
    assert.ok((await page.evaluate(() => window.lastInventoryNotice))?.title)
    await page.getByRole('button', { name: lang === 'zh' ? '我的申请' : 'My requests', exact: true }).click()
    await page.getByRole('button', { name: /测试会员/ }).click()
    await dialog.waitFor()
    assert.equal(await dialog.getByRole('button', { name: lang === 'zh' ? '批准' : 'Approve', exact: true }).count(), 0)
    await page.screenshot({ path: `${output}/${width}-${lang}-detail.png`, fullPage: true })
    await dialog.getByRole('button', { name: lang === 'zh' ? '关闭' : 'Close', exact: true }).click()
    if (role !== 'ordinary_member') {
      await page.goto(`${base}/tests/fixtures/inventory.html?lang=${lang}&role=${role}&management=true`)
      await page.getByRole('heading', { name: '活动用剪刀' }).waitFor()
      assert.equal(await page.getByRole('button', { name: '申请', exact: true }).count(), 0)
      await page.getByRole('button', { name: '申请处理', exact: true }).click()
      await page.getByRole('button', { name: /测试会员/ }).click()
      await dialog.waitFor()
      assert.equal(await dialog.getByRole('button', { name: '批准', exact: true }).count(), 1)
      await dialog.getByRole('button', { name: '关闭', exact: true }).click()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
      await page.screenshot({ path: `${output}/${width}-${lang}-management.png`, fullPage: true })
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
