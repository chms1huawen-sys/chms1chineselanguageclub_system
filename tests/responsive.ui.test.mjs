import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const browser=await chromium.launch({channel:'msedge',headless:true})
const output='node_modules/.cache/responsive-screenshots'
await mkdir(output,{recursive:true})
try {
  for(const width of [360,390,1440]) for(const lang of ['zh','en']) {
    const page=await browser.newPage({viewport:{width,height:740},hasTouch:width<500})
    const errors=[]
    page.on('pageerror',e=>errors.push(e.message))
    await page.route('**/*.supabase.co/**',route=>route.fulfill({contentType:'application/json',body:JSON.stringify([{id:'test',name:'测试会员',email:'averylongmemberemailaddressfortestingresponsive@gmail.com',role:'vice_general_affairs',is_active:true}])}))
    await page.goto(`http://127.0.0.1:5173/tests/fixtures/responsive.html?lang=${lang}`)
    await page.getByText('测试会员',{exact:true}).filter({visible:true}).first().waitFor()
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
    await page.screenshot({path:`${output}/members-${width}-${lang}.png`,fullPage:true})
    await page.getByRole('button',{name:'Guide',exact:true}).click()
    const dialog=page.getByRole('dialog')
    await dialog.waitFor()
    for(let step=0;step<6;step++) await dialog.getByRole('button',{name:lang==='zh'?'下一步':'Next',exact:true}).click()
    await page.screenshot({path:`${output}/guide-${width}-${lang}.png`,fullPage:true})
    await dialog.getByRole('button',{name:lang==='zh'?'开始使用 🎉':"Let's Start 🎉",exact:true}).click()
    await dialog.waitFor({state:'hidden'})
    assert.deepEqual(errors,[])
    await page.close()
  }
  console.log('Tutorial all 7 steps, close, and long member emails: 360/390/1440px, Chinese/English passed.')
} finally {await browser.close()}
