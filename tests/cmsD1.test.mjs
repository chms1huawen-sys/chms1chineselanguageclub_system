import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFile } from 'node:fs/promises'
import { CMS_TABLES, cmsOperation, publicCmsSnapshot } from '../server/cmsModel.js'
import { cmsProfile, commitCms, loadCms, createCmsHandler } from '../cloudflare/public-preview/cms.js'

const id = '10000000-0000-4000-8000-000000000001'
const mediaId = '20000000-0000-4000-8000-000000000001'
const profile = {id,role:'media_lead',is_active:true}
function fixture() {
  const data = Object.fromEntries(CMS_TABLES.map(table=>[table,[]]))
  data.blog_settings=[{id:1,title:'Club',content:{}}]
  data.blog_posts=[{id,title:'Story',slug:'story',status:'published',content_type:'article',content_year:2026,version:1,published_at:'2026-10-01T00:00:00Z'}]
  data.blog_media=[{id:mediaId,post_id:id,path:`${id}/display.webp`,original_path:`${id}/private.jpg`}]
  data.blog_links=[{id:'link',post_id:id,label:'Private',url:'https://example.com/private',visibility:'member'}]
  return data
}
test('D1 enforces teacher/media roles, revocations and archive permissions',()=>{
  const data=fixture(), command={table:'blog_posts',action:'select'}
  for(const role of ['ordinary_member','chairperson','vice_chairperson','treasurer','custom']) assert.throws(()=>cmsOperation(data,command,{...profile,role,can_manage_blog:true}),/BLOG_FORBIDDEN/)
  for(const role of ['convener_teacher','advisor_teacher','advisor','media_lead','vice_media_lead','social_media_editor']) assert.equal(cmsOperation(data,command,{...profile,role}).result.length,1)
  assert.throws(()=>cmsOperation(data,command,{...profile,is_active:false}),/BLOG_FORBIDDEN/)
  assert.throws(()=>cmsOperation(data,command,{...profile,can_manage_blog:false}),/BLOG_FORBIDDEN/)
  assert.throws(()=>cmsOperation(data,{table:'blog_years',action:'upsert',values:{year:2026,is_archived:true}},profile),/BLOG_ARCHIVE_FORBIDDEN/)
  data.blog_years=[{year:2026,is_archived:true}]
  assert.throws(()=>cmsOperation(data,{rpc:'blog_studio_save',args:{p_post:data.blog_posts[0],p_version:1}},profile),/BLOG_YEAR_ARCHIVED/)
})
test('D1 saves preserve fields, reject conflicting versions and cross-post media',()=>{
  const data=fixture(), post={...data.blog_posts[0],body:'New text',author:'Writer',book_details:{isbn:'123'}}
  const args={p_post:post,p_version:1,p_links:[],p_media:[{id:mediaId,caption:'Caption',crop:{unit:'%',x:0,y:0,width:100,height:100}}]}
  const saved=cmsOperation(data,{rpc:'blog_studio_save',args},profile)
  assert.equal(saved.result.version,2)
  assert.equal(saved.result.author,'Writer')
  assert.equal(saved.data.blog_media[0].caption,'Caption')
  assert.throws(()=>cmsOperation(data,{rpc:'blog_studio_save',args:{...args,p_version:0}},profile),/BLOG_EDIT_CONFLICT/)
  assert.throws(()=>cmsOperation(data,{rpc:'blog_studio_save',args:{...args,p_post:{...post,id:mediaId}}},profile),/BLOG_EDIT_CONFLICT/)
  assert.throws(()=>cmsOperation(data,{rpc:'blog_studio_save',args:{...args,p_media:[{id:'other'}]}},profile),/CMS_MEDIA_OWNER_MISMATCH/)
  assert.throws(()=>cmsOperation(data,{rpc:'blog_studio_save',args:{...args,p_links:[{label:'Bad',url:'javascript:alert(1)',visibility:'public'}]}},profile),/CMS_INVALID_LINK/)
})
test('D1 public export excludes drafts, private original paths and member links',()=>{
  const data=fixture()
  data.blog_posts.push({...data.blog_posts[0],id:mediaId,slug:'draft',status:'draft',body:'SECRET_DRAFT'})
  const text=JSON.stringify(publicCmsSnapshot(data))
  assert.equal(JSON.parse(text).posts.length,1)
  for(const secret of ['SECRET_DRAFT','private.jpg','https://example.com/private']) assert.ok(!text.includes(secret))
})
function d1Adapter(sql) {
  return {
    prepare(query) {
      let args=[]
      const statement={bind(...values){args=values;return statement},async all(){return{results:sql.prepare(query).all(...args)}},async first(){return sql.prepare(query).get(...args)||null},run(){return sql.prepare(query).run(...args)}}
      return statement
    },
    async batch(statements){sql.exec('BEGIN');try{const results=statements.map(statement=>({meta:{changes:statement.run().changes}}));sql.exec('COMMIT');return results}catch(error){sql.exec('ROLLBACK');throw error}},
  }
}
test('D1 commits are atomic, stale revisions cannot partially overwrite records',async()=>{
  const sql=new DatabaseSync(':memory:')
  try{
    sql.exec(await readFile(new URL('../cloudflare/public-preview/migrations/0001_cms.sql',import.meta.url),'utf8'))
    sql.exec('UPDATE cms_state SET active=1 WHERE id=1')
    const db=d1Adapter(sql), empty=await loadCms(db)
    await commitCms(db,empty,fixture(),'2026-10-18T00:00:00Z')
    const initial=await loadCms(db), a=structuredClone(initial.data), b=structuredClone(initial.data)
    a.blog_posts[0].title='First'; b.blog_posts[0].title='Second'
    await commitCms(db,initial,a,'2026-10-18T00:01:00Z')
    await assert.rejects(commitCms(db,initial,b,'2026-10-18T00:02:00Z'),/BLOG_EDIT_CONFLICT/)
    assert.equal((await loadCms(db)).data.blog_posts[0].title,'First')
  }finally{sql.close()}
})
test('Authentication verifies real user and role, rejects inactive and chair overrides',async()=>{
  for(const override of [{role:'chairperson',can_manage_blog:true},{role:'media_lead',is_active:false},{role:'media_lead',can_manage_blog:false}]){
    let calls=0
    const request=async()=>Response.json(++calls===1?{id}:[{...profile,...override}])
    await assert.rejects(cmsProfile(new Request('https://chms1clc.org/api/blog-admin',{headers:{Authorization:'Bearer test'}}),{CMS_AUTH_URL:'https://example.supabase.co',CMS_AUTH_ANON_KEY:'anon'},request),/BLOG_FORBIDDEN/)
  }
  const handler=createCmsHandler({authenticate:async()=>{throw Object.assign(new Error('LOGIN_REQUIRED'),{status:401})}})
  const result=await handler(new Request('https://chms1clc.org/api/blog-admin',{method:'POST',body:'{}'}),{CMS:{}})
  assert.equal(result.status,401)
  const badOrigin=await handler(new Request('https://chms1clc.org/api/blog-admin',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'}),{CMS:{}})
  assert.equal(badOrigin.status,403)
})

test('R2 upload validates bytes, stays private until referenced, and refuses deleting referenced media',async()=>{
  const sql=new DatabaseSync(':memory:'), objects=new Map()
  try{
    sql.exec(await readFile(new URL('../cloudflare/public-preview/migrations/0001_cms.sql',import.meta.url),'utf8'))
    sql.exec(await readFile(new URL('../cloudflare/public-preview/migrations/0002_cms_rate.sql',import.meta.url),'utf8'))
    sql.exec('UPDATE cms_state SET active=1 WHERE id=1')
    const db=d1Adapter(sql)
    await commitCms(db,await loadCms(db),fixture(),new Date().toISOString())
    const bucket={
      async put(key,bytes,options={}){if(objects.has(key)&&options.onlyIf)return null;objects.set(key,{body:bytes,size:bytes.byteLength,...options});return{key}},
      async get(key){return objects.get(key)||null},async head(key){return objects.get(key)||null},async delete(keys){for(const key of keys)objects.delete(key)},
    }
    const handler=createCmsHandler({authenticate:async()=>profile}), env={CMS:db,PUBLIC_SITE:bucket}
    const image=await readFile(new URL('../public/login-group-2026.jpeg',import.meta.url))
    const upload=bytes=>handler(new Request('https://chms1clc.org/api/blog-admin/upload',{method:'POST',headers:{'Content-Type':'image/jpeg','x-upload-bucket':'blog-photos','x-upload-owner':id},body:bytes}),env)
    const invalid=await upload(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))
    assert.equal(invalid.status,400);assert.equal(objects.size,0)
    const response=await upload(image)
    assert.equal(response.status,200)
    const {data:{path}}=await response.json()
    assert.match(path,/\/r2-/);assert.equal(objects.size,2)
    const call=command=>handler(new Request('https://chms1clc.org/api/blog-admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(command)}),env)
    const inserted=await call({table:'blog_media',action:'insert',values:{post_id:id,path,caption:'R2 test'}})
    assert.equal(inserted.status,200)
    const imageRead=await call({action:'image',bucket:'blog-photos',path})
    assert.equal(imageRead.status,200);assert.equal(imageRead.headers.get('Cache-Control'),'private, no-store')
    const denied=await call({action:'removeImages',paths:[path]})
    assert.equal(denied.status,409);assert.equal(objects.size,2)
    const arbitrary=await call({action:'removeImages',paths:['backups/secret.7z']})
    assert.equal(arbitrary.status,400);assert.equal(objects.size,2)
    const secret=await call({table:'users',action:'select'})
    assert.equal(secret.status,400)
  }finally{sql.close()}
})
