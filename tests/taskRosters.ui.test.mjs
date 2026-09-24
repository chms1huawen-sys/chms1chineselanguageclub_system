import assert from 'node:assert/strict'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const page=await browser.newPage({viewport:{width:390,height:844}})
 const errors=[],scopes=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*.supabase.co/**',async route=>{
  const url=new URL(route.request().url()); let data=[]
  if(url.pathname.endsWith('/teams')) data=[{id:'board',name:'学期',session:'2026-H2',type:'board'},{id:'event',name:'活动筹委',type:'event',session:'2026'}]
  if(url.pathname.endsWith('/users')) data=[{id:'president',name:'测试主席',role:'chairperson',is_active:true},{id:'member',name:'测试会员',role:'ordinary_member',is_active:true}]
  if(url.pathname.endsWith('/team_members')) data=[{team_id:'event',user_id:'member'}]
  if(url.pathname.endsWith('/tasks')) scopes.push(url.searchParams.get('task_scope'))
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)})
 })
 await page.goto('http://127.0.0.1:5173/tests/fixtures/tasks.html')
 const select=page.locator('select').first()
 await page.getByRole('option',{name:/2026 下半年 会员名单/}).waitFor({state:'attached'})
 assert.equal(await select.inputValue(),'board:members')
 await page.getByRole('button',{name:'发布任务',exact:true}).click()
 assert.equal(await page.getByText('测试会员',{exact:true}).count(),1)
 await page.getByRole('button',{name:'取消',exact:true}).click()
 await select.selectOption('board:executive')
 await page.getByRole('button',{name:'发布任务',exact:true}).click()
 assert.equal(await page.getByText('测试会员',{exact:true}).count(),0)
 assert.equal(await page.getByText('测试主席',{exact:true}).count(),1)
 await page.getByRole('button',{name:'取消',exact:true}).click()
 await select.selectOption('event')
 await page.getByRole('button',{name:'发布任务',exact:true}).click()
 assert.equal(await page.getByText('测试会员',{exact:true}).count(),1)
 assert.equal(await page.getByText('测试主席',{exact:true}).count(),0)
 assert.ok(scopes.includes('eq.members')&&scopes.includes('eq.executive'))
 assert.deepEqual(errors,[])
 console.log('Mobile roster switching, default membership, executive filtering and committee membership passed.')
} finally {await browser.close()}
