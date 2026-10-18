import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { CMS_TABLES } from '../server/cmsModel.js'
import { createD1SourceReader } from '../server/publicD1Source.js'

test('Legacy cutover freezes only CMS writes, retaining reads and member tables',async()=>{
  const {PGlite}=await import('@electric-sql/pglite')
  const db=new PGlite()
  try{
    await db.exec("create role anon;create role authenticated;create schema auth;create function auth.uid() returns uuid language sql as $$ select null::uuid $$;create table users(id uuid,is_active boolean,can_manage_blog boolean,role text);create table tasks(id int);")
    for(const table of CMS_TABLES) await db.exec('create table '+table+'(id int);insert into '+table+' values(1)')
    await db.exec(await readFile(new URL('../supabase_migration_2026_10_18_blog_d1_cutover.sql',import.meta.url),'utf8'))
    await db.exec("update blog_posts set id=2;update blog_platform_status set provider='cloudflare-d1' where id=1")
    for(const table of CMS_TABLES){
      await assert.rejects(db.exec('insert into '+table+' values(3)'),/BLOG_MOVED_TO_D1/)
      await assert.rejects(db.exec('update '+table+' set id=4'),/BLOG_MOVED_TO_D1/)
      await assert.rejects(db.exec('delete from '+table),/BLOG_MOVED_TO_D1/)
      assert.equal((await db.query('select count(*)::int n from '+table)).rows[0].n,1)
    }
    await db.exec('insert into tasks values(1)')
    assert.equal((await db.query('select count(*)::int n from tasks')).rows[0].n,1)
  }finally{await db.close()}
})
test('D1 source outages fail closed rather than returning to old article data',async()=>{
  const reader=createD1SourceReader('https://chms1clc.org/api/blog-source',async()=>new Response('',{status:503}))
  await assert.rejects(reader.read(),/D1 publication source unavailable/)
  const inactive=createD1SourceReader('https://chms1clc.org/api/blog-source',async()=>Response.json({active:false}))
  assert.deepEqual(await inactive.read(),{active:false})
})
