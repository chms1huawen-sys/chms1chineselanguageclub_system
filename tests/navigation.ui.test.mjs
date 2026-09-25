import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {compareMembers} from '../src/utils/memberOrder.js'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const browser=await chromium.launch({channel:'msedge',headless:true})
try {
 const page=await browser.newPage({viewport:{width:390,height:640}})
 await page.setContent(`<style>body{margin:0}.club-sidebar{position:fixed;inset:0 auto 0 0;width:256px;display:flex;flex-direction:column;overflow:hidden;background:#95cbff}.club-sidebar>div{height:1100px}main{height:2400px}</style><div class="club-mobile-menu-open"><aside class="club-sidebar"><div>Navigation</div></aside><main>Page</main></div>`)
 await page.addStyleTag({content:await readFile(new URL('../src/mobileNavigation.css',import.meta.url),'utf8')})
 await page.mouse.move(100,300);await page.mouse.wheel(0,600)
 await page.waitForFunction(()=>document.querySelector('aside').scrollTop>0)
 assert.equal(await page.evaluate(()=>window.scrollY),0)
 assert.equal(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden')
 await page.evaluate(()=>document.querySelector('.club-mobile-menu-open').classList.remove('club-mobile-menu-open'))
 assert.notEqual(await page.evaluate(()=>getComputedStyle(document.body).overflow),'hidden')
 const users=[{role:'ordinary_member',name:'A'},{role:'secretary',name:'B'},{role:'chairperson',name:'C'},{role:'advisor_teacher',name:'D'}]
 assert.deepEqual(users.sort(compareMembers).map(u=>u.name),['D','C','B','A'])
 console.log('Independent mobile sidebar scrolling, background lock/release and account-role ordering passed.')
}finally{await browser.close()}
