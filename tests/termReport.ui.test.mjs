import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const browser=await chromium.launch({channel:'msedge',headless:true})
await mkdir('node_modules/.cache/term-report',{recursive:true})
try {
 for(const width of [390,1440]) {
 const page=await browser.newPage({viewport:{width,height:900}});const errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/rest/v1/rpc/club_term_report',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({generated_at:'2026-09-24T12:00:00Z',start:'2026-07-01',end:'2026-12-31',rosters:[{session:'2026-H2',members:[{name:'黄同学',role:'chairperson'},{name:'林同学',position:'普通会员'}]}],committees:[{name:'朗诵比赛',session:'2026',members:[{name:'林同学',position:'筹委主席'}]}],leaves:[{leave_date:'2026-08-01',applicant_name:'林同学',leave_type:'sick',reason:'身体不适'}],events:[{date:'2026-08-15',title:'朗诵比赛',type:'event',notes:'活动记录'},{date:'2026-09-01',title:'筹备会议',type:'meeting'}],inventory:[{category:'文具',name:'剪刀',available:10,reserved:0,on_loan:2,unit:'把'}],finance:{opening:100,closing:90,entries:[{description:'收入测试',amount:20},{description:'文具支出',amount:-30}]},formats:[]})}))
 await page.goto('http://127.0.0.1:5173/tests/fixtures/term-report.html')
 await page.getByRole('button',{name:'打印半年／年度报告',exact:true}).click()
 await page.getByRole('button',{name:'生成预览',exact:true}).click()
 await page.locator('.term-report-document').waitFor()
 assert.equal(await page.locator('.term-report-document section').count(),6)
 assert.equal(await page.locator('.term-signatures').isVisible(),false)
 assert.ok((await page.locator('.term-finance').textContent()).includes('01-01'))
 if(width===1440) await page.pdf({path:'node_modules/.cache/term-report/report.pdf',format:'A4',preferCSSPageSize:true,printBackground:true})
 await page.screenshot({path:`node_modules/.cache/term-report/${width}.png`})
 await page.getByLabel('年份',{exact:true}).fill('2025')
 assert.equal(await page.getByRole('button',{name:'打印 / 保存 PDF',exact:true}).isEnabled(),false)
 assert.deepEqual(errors,[]);await page.close()
 }
 console.log('Report preview, mobile/desktop, stale-preview invalidation and PDF export passed.')
} finally {await browser.close()}
