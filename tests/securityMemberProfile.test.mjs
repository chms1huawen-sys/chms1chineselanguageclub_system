import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { MEMBER_PROFILE_FIELDS } from '../src/utils/memberProfile.js'

test('browser profile projection excludes tokens while retaining settings and permissions',()=>{
  const fields=MEMBER_PROFILE_FIELDS.split(',')
  assert.ok(!fields.includes('fcm_token'))
  for(const field of ['id','name','role','is_active','notification_enabled','can_manage_blog','can_manage_accounts']) assert.ok(fields.includes(field))
})
test('after-deploy column restrictions deny token reads but retain roster reads',async()=>{
  const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
  const db=new PGlite()
  try{
    await db.exec("create role anon; create role authenticated; create table users(id int,name text,fcm_token text); grant select on users to anon,authenticated; insert into users values(1,'Member','Private device');")
    await db.exec(await readFile(new URL('../supabase_migration_2026_10_03_member_token_privacy_AFTER_DEPLOY.sql',import.meta.url),'utf8'))
    await db.exec('set role authenticated')
    assert.equal((await db.query('select name from users')).rows[0].name,'Member')
    await assert.rejects(db.query('select fcm_token from users'),/permission denied/)
    await assert.rejects(db.query('select * from users'),/permission denied/)
  }finally{await db.close()}
})
