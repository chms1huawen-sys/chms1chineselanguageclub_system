import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const browser=await chromium.launch({channel:'msedge',headless:true})
await mkdir('node_modules/.cache/performance',{recursive:true})
try {
 for(const width of [390,900,1440]) {
  const page=await browser.newPage({viewport:{width,height:900}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.goto('http://127.0.0.1:5173/tests/fixtures/performance.html')
  const list=page.getByRole('region',{name:'公告列表'})
  await list.waitFor()
  const cards=page.locator('.performance-cards-grid')
  const expected=width<768?1:width<1280?2:3
  assert.equal(await cards.locator('article:visible').count(),expected)
  await page.getByRole('button',{name:'展开全部（共 5 人）',exact:true}).click()
  assert.equal(await cards.locator('article:visible').count(),5)
  await page.locator('.performance-cards-toggle').click()
  assert.equal(await cards.locator('article:visible').count(),expected)
  assert.equal(await list.locator('article:visible').count(),width<768?2:5)
  if(width<768) {
   await page.getByRole('button',{name:'展开全部（共 5 条）'}).click()
   assert.equal(await list.locator('article:visible').count(),5)
   assert.ok(await list.evaluate(el=>el.scrollHeight>el.clientHeight))
   await page.getByRole('button',{name:'收起',exact:true}).click()
   assert.equal(await list.locator('article:visible').count(),2)
  } else assert.equal(await page.locator('.dashboard-mobile-list-toggle').isVisible(),false)
  await page.getByRole('button',{name:'准时率',exact:true}).click()
  assert.ok((await page.locator('tbody tr').first().textContent()).includes('甲同学'))
  await page.locator('.performance-member').filter({hasText:'乙同学'}).click()
  assert.ok((await page.locator('.performance-detail').textContent()).includes('0 / 1'))
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:`node_modules/.cache/performance/${width}.png`,fullPage:true})
  assert.deepEqual(errors,[]);await page.close()
 }
 console.log('Mobile collapse/expand, desktop unchanged, comparison sort/details and responsive width passed.')
} finally {await browser.close()}
