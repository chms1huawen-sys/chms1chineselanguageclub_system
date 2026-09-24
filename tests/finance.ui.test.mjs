import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({ headless: true, channel: 'msedge' })
const base = process.env.INVENTORY_TEST_URL || 'http://127.0.0.1:5173'
const output = 'node_modules/.cache/finance-screenshots'
await mkdir(output, { recursive: true })
const entries = [40,30,170.05,10,30,-21.80,-13,-18,-15,-44,-150].map((amount,i) => ({id:String(i),amount,kind:amount>0?'income':'expense',description:['新生团服及团费','小六生欢乐营','赞助','义卖','退款','文具','零食','材料','冰块','莲花灯笼材料','制作材料'][i],entry_date:'2026-09-01',actor_name:'财政'}))
try {
  for (const [width,height,lang] of [[1440,1000,'zh'],[390,844,'zh'],[390,844,'en']]) {
    const page = await browser.newPage({viewport:{width,height}})
    const errors = [], requests = []
    let recordedIncome = false
    let format = {lang,title:zhTitle(lang),category:lang==='zh'?'类别':'Type',item:lang==='zh'?'项目':'Description',total:lang==='zh'?'合计':'Total'}
    let claim = {id:'22222222-2222-4222-8222-222222222222',applicant_id:'11111111-1111-4111-8111-111111111111',applicant_name:'会员',title:'文具报销',description:'活动使用',amount:21.8,expense_date:'2026-09-01',status:'treasury',finance_receipts:[{id:'r1',name:'Receipt.pdf',path:'receipt.pdf'}],finance_reviews:[]}
    page.on('pageerror',err=>errors.push(err.message))
    await page.route('**/*.supabase.co/**',async route=>{
      const url = new URL(route.request().url())
      requests.push(url)
      let data = []
      if(url.pathname.endsWith('/finance_report_format')) data=[format]
      if(url.pathname.endsWith('/finance_save_report_headings')) { const b=route.request().postDataJSON(); format={lang:b.p_lang,title:b.p_title,category:b.p_category,item:b.p_item,total:b.p_total,club_label:b.p_club_label,club_name:b.p_club_name}; data=null }
      if(url.pathname.endsWith('/finance_record_income')) { const body=route.request().postDataJSON(); assert.equal(body.p_data.amount,'15.50'); recordedIncome=true; data={notification_ids:[]} }
      if(url.pathname.endsWith('/finance_report_years')) data = [Number(new Date().getFullYear()),2025]
      if(url.pathname.endsWith('/finance_claims')) data = [claim]
      if(url.pathname.endsWith('/finance_report')) {
        const body = route.request().postDataJSON()
        assert.ok(body.p_start && body.p_end)
        data = {opening:283.25,closing:301.50,entries}
      }
      if(url.pathname.endsWith('/finance_mutate')) {
        const body=route.request().postDataJSON()
        if(body.p_action==='submit') {
          assert.equal(body.p_data.receipts.length,1)
          assert.ok(body.p_data.receipts[0].path.endsWith('.png'))
        }
        if(body.p_action==='approve') { assert.equal(body.p_data.expected_status,'treasury'); claim={...claim,status:'president'} }
        if(body.p_action==='income') { assert.equal(body.p_data.amount,'15.50'); assert.equal(body.p_data.description,'Test income'); recordedIncome = true }
        data={id:claim.id,notification_ids:[]}
      }
      if(url.pathname.includes('/storage/v1/object/')) data={Key:'receipt.png'}
      await route.fulfill({status:200,contentType:'application/json',headers:{'Content-Range':'0-0/1'},body:JSON.stringify(data)})
    })
    const zh=lang==='zh'
    await page.goto(`${base}/tests/fixtures/finance.html?lang=${lang}&role=ordinary_member`)
    await page.getByRole('button',{name:/文具报销/}).waitFor()
    assert.equal(await page.getByRole('link',{name:zh?'财政管理':'Manage finance'}).count(),0)
    assert.ok(requests.some(u=>u.searchParams.get('applicant_id')==='eq.11111111-1111-4111-8111-111111111111'))
    await page.getByRole('button',{name:zh?'申请报销':'New claim',exact:true}).click()
    const dialog=page.getByRole('dialog')
    await dialog.getByLabel(zh?'报销事项':'Claim title',{exact:true}).fill('活动用文具')
    await dialog.getByLabel(zh?'金额（RM）':'Amount (RM)',{exact:true}).fill('21.80')
    await dialog.getByLabel(zh?'支出日期':'Expense date',{exact:true}).fill('2026-09-01')
    await dialog.locator('input[type=file]').setInputFiles({name:'receipt.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=','base64')})
    const bounds=await dialog.boundingBox()
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width)
    await page.screenshot({path:`${output}/${width}-${lang}-claim.png`,fullPage:true})
    await dialog.getByRole('button',{name:zh?'确认':'Confirm',exact:true}).click()
    await dialog.waitFor({state:'hidden'})
    assert.ok(await page.evaluate(()=>window.lastFinanceNotice?.title))
    await page.goto(`${base}/tests/fixtures/finance.html?lang=${lang}&role=advisor_teacher&management=true`)
    await page.locator('.finance-table').waitFor()
    const totals=await page.locator('tfoot td').allTextContents().then(values => values.filter(Boolean))
    assert.deepEqual(totals,['563.30','563.30'])
    assert.equal(await page.getByLabel(zh?'年份':'Year',{exact:true}).locator('option').count(),2)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    assert.equal(await page.locator('.finance-signatures').isVisible(),false)
    assert.equal(await page.locator('.finance-table tr').count(),20)
    await page.screenshot({path:`${output}/${width}-${lang}-ledger.png`,fullPage:true})
    if (width===1440 && process.env.FINANCE_PRINT_TEST==='1') {
      await page.pdf({path:`${output}/ledger-print.pdf`,format:'A4',preferCSSPageSize:true,printBackground:true})
      await page.emulateMedia({media:'print'})
      assert.equal(await page.locator('.finance-signatures').isVisible(),true)
      const printedWidth=await page.locator('.finance-table').evaluate(el=>el.getBoundingClientRect().width)
      assert.ok(Math.abs(printedWidth-195.6*96/25.4)<1)
      await page.locator('.finance-table tbody').evaluate(body => {
        const row=body.children[1]
        for(let i=0;i<60;i++) body.insertBefore(row.cloneNode(true),body.lastElementChild)
      })
      await page.pdf({path:`${output}/ledger-multipage.pdf`,format:'A4',preferCSSPageSize:true,printBackground:true})
      await page.emulateMedia({media:'screen'})
      await page.locator('.finance-table tbody').evaluate(body => { while(body.children.length>18) body.children[17].remove() })
    }
    assert.equal(await page.locator('.finance-table th').filter({hasText:/^b\/d$/}).count(),1)
    assert.equal(await page.locator('.finance-table th').filter({hasText:/^c\/d$/}).count(),1)
    assert.equal(await page.getByRole('button',{name:zh?'年度':'Yearly',exact:true}).getAttribute('aria-pressed'),'true')
    await page.getByRole('button',{name:zh?'半年度':'Half-yearly',exact:true}).click()
    await page.getByLabel(zh?'半年':'Half-year',{exact:true}).selectOption('1')
    assert.ok((await page.locator('.finance-report-heading').textContent()).includes(zh?'1月1日至6月30日':'01-01 to'))
    await page.getByLabel(zh?'半年':'Half-year',{exact:true}).selectOption('2')
    await page.getByRole('button',{name:zh?'编辑报表文字':'Edit report labels',exact:true}).click()
    assert.equal(await dialog.getByLabel(zh?'标题':'Title',{exact:true}).inputValue(),zh?`${new Date().getFullYear()}年社团财政报告`:`${new Date().getFullYear()} Club Financial Report`)
    await dialog.getByLabel(zh?'社团/学会栏标题':'Club field label',{exact:true}).fill('Club label')
    await dialog.getByLabel(zh?'社团名称':'Club name',{exact:true}).fill('CLC_sys test')
    await dialog.getByLabel(zh?'标题':'Title',{exact:true}).fill('Updated statement')
    await dialog.getByRole('button',{name:zh?'确认':'Confirm',exact:true}).click()
    await dialog.waitFor({state:'hidden'})
    await page.getByRole('heading',{name:/Updated statement/}).waitFor()
    assert.ok((await page.locator('.finance-report-heading').textContent()).includes('Club label : CLC_sys test'))
    assert.deepEqual(await page.locator('tfoot td').allTextContents().then(values=>values.filter(Boolean)),['563.30','563.30'])
    assert.equal(await page.getByLabel(zh?'月份':'Month',{exact:true}).count(),0)
    await page.getByRole('button',{name:zh?'月度':'Monthly',exact:true}).click()
    await page.getByLabel(zh?'月份':'Month',{exact:true}).selectOption('02')
    await page.getByRole('button',{name:zh?'年度':'Yearly',exact:true}).click()
    await page.getByRole('button',{name:zh?'收入登记':'Income',exact:true}).click()
    await page.getByRole('button',{name:zh?'登记收入':'Record income',exact:true}).click()
    await dialog.getByLabel(zh?'金额（RM）':'Amount (RM)',{exact:true}).fill('15.50')
    await dialog.getByLabel(zh?'项目说明':'Entry description',{exact:true}).fill('Test income')
    await dialog.getByRole('button',{name:zh?'确认':'Confirm',exact:true}).click()
    await dialog.waitFor({state:'hidden'})
    assert.equal(recordedIncome,true)
    await page.screenshot({path:`${output}/${width}-${lang}-income.png`,fullPage:true})
    await page.getByRole('button',{name:zh?'报销审批':'Claim reviews',exact:true}).click()
    await page.getByRole('button',{name:/文具报销/}).click()
    await dialog.getByRole('button',{name:zh?'批准本阶段':'Approve this stage',exact:true}).click()
    await dialog.getByRole('button',{name:zh?'确认':'Confirm',exact:true}).click()
    await dialog.waitFor({state:'hidden'})
    await page.getByRole('button',{name:/文具报销/}).filter({hasText:zh?'待主席批准':'President review'}).waitFor()
    assert.deepEqual(errors,[])
    await page.close()
  }
  console.log('Finance: desktop/mobile, Chinese/English, claim uploads, member privacy, approval UI and sample ledger 563.30 totals passed (mocked API).')
} finally {await browser.close()}

function zhTitle(lang) { return lang==='zh'?'一中华文学会 · 收支账目':'CLC_sys · Financial Statement' }
