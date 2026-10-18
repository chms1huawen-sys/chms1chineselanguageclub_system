import { readFile, writeFile } from 'node:fs/promises'
import { PUBLIC_ORIGIN,SOURCE_ORIGIN } from '../src/utils/siteOrigins.js'
import { validPublicSnapshot } from '../src/utils/publicSnapshot.js'

const original=JSON.parse(await readFile('test-results/cms-source-export-20261019.json','utf8'))
const results=[]
async function request(url,options={}) {
  const response=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(15000)})
  return response
}
const source=await(await request(PUBLIC_ORIGIN+'/api/blog-source')).json()
if(!source.active || !validPublicSnapshot(source.snapshot))throw new Error('D1 source not active or invalid')
const publicData=await(await request(PUBLIC_ORIGIN+'/api/blog-public')).json()
if(publicData.cmsRevision!==source.revision)throw new Error('R2 publication revision is stale')
const published=original.blog_posts.filter(row=>row.status==='published'&&!row.deleted_at)
if(source.snapshot.posts.length!==published.length || publicData.posts.length!==published.length)throw new Error('Published count mismatch')
const privateIds=new Set(original.blog_posts.filter(row=>row.status!=='published'||row.deleted_at).map(row=>row.id))
if(publicData.posts.some(row=>privateIds.has(row.id)) || source.snapshot.media.some(row=>row.original_path) || source.snapshot.links.some(row=>row.visibility!=='public'))throw new Error('Private data in public export')
for(const route of ['/', '/literature','/activities','/bookroom','/news','/about',...published.map(row=>'/blog/'+row.slug)]){
  const response=await request(PUBLIC_ORIGIN+route), html=await response.text()
  if(response.status!==200 || !html.includes('rel="canonical" href="'+PUBLIC_ORIGIN+route+'"'))throw new Error('Public route failed: '+route)
  results.push({route,status:response.status})
}
for(const route of ['/api/blog-admin','/api/blog-member','/api/blog-admin/upload']){
  const response=await request(PUBLIC_ORIGIN+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})
  if(response.status!==401)throw new Error('Anonymous private access was not denied')
  results.push({route,status:response.status})
}
for(const post of original.blog_posts.filter(row=>row.status==='trash')){
  const response=await request(PUBLIC_ORIGIN+'/blog/'+post.slug)
  if(response.status!==404)throw new Error('Trash article is publicly accessible')
  results.push({route:'/blog/'+post.slug,status:response.status,privateCheck:true})
}
const privatePhoto=original.blog_media.find(row=>row.original_path)
if(privatePhoto){
  const response=await request(PUBLIC_ORIGIN+'/public-media/blog-photos/'+privatePhoto.original_path,{method:'HEAD'})
  if(response.status!==404)throw new Error('Original photo is publicly accessible')
}
const forbidden=await request(PUBLIC_ORIGIN+'/api/blog-admin',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})
if(forbidden.status!==403)throw new Error('Untrusted origin not denied')
const member=await request(SOURCE_ORIGIN+'/member')
if(member.status!==200 || !member.headers.get('x-robots-tag')?.includes('noindex'))throw new Error('Member entry changed')
const login=await request(PUBLIC_ORIGIN+'/api/blog-login-settings',{headers:{Origin:SOURCE_ORIGIN}})
if(login.status!==200 || login.headers.get('access-control-allow-origin')!==SOURCE_ORIGIN)throw new Error('Member login presentation bridge failed')
const html=await(await request(PUBLIC_ORIGIN+'/')).text()
const entry=html.match(/src="(\/assets\/index-[a-zA-Z0-9_-]+\.js)"/)
if(!entry || (await request(PUBLIC_ORIGIN+entry[1])).status!==200)throw new Error('Current public entry asset unavailable')
const report={checkedAt:new Date().toISOString(),active:true,revision:source.revision,totalPosts:original.blog_posts.length,published:published.length,trash:original.blog_posts.filter(row=>row.status==='trash').length,media:original.blog_media.length,memberEntry:member.status,loginPresentation:login.status,untrustedOrigin:forbidden.status,results,browserVerification:'not completed: browser connection unavailable'}
await writeFile('test-results/cms-live-acceptance-20261019.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
