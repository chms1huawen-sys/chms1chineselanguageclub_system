import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canEditOwnLeave, leaveEditValues } from '../src/utils/leaveEditing.js'
const {PGlite}=await import('@electric-sql/pglite')
const owner='10000000-0000-0000-0000-000000000001'
const manager='10000000-0000-0000-0000-000000000002'
const inactive='10000000-0000-0000-0000-000000000003'
const record='20000000-0000-0000-0000-000000000001'

test('edit eligibility is owner-only, active-only, and payload excludes ownership and status',()=>{
  const row={user_id:owner}
  assert.equal(canEditOwnLeave({id:owner,is_active:true},row),true)
  for(const profile of [null,{id:owner,is_active:false},{id:owner},{id:manager,is_active:true,role:'chairperson'},{id:manager,is_active:true,role:'advisor_teacher'}])assert.equal(canEditOwnLeave(profile,row),false)
  assert.deepEqual(leaveEditValues({leave_type:'sick',custom_leave_type:'Ignored',leave_date:'2026-10-20',reason:' Reason ',drive_file_url:' ',attachment_uploaded:true,user_id:manager,status:'approved'}),{leave_type:'sick',custom_leave_type:null,leave_date:'2026-10-20',reason:'Reason',drive_file_url:null,attachment_uploaded:true})
})

test('real RLS migration permits only owner fields, excludes managers, and detects stale edits',async()=>{
  const db=new PGlite()
  async function as(id,role='authenticated'){
    await db.exec('reset role')
    await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[id,role])
    await db.exec(`set role ${role}`)
  }
  try{
    await db.exec(`create role authenticated;create role anon;create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
      grant usage on schema auth to authenticated,anon;
      create table users(id uuid primary key,is_active boolean,role text);
      insert into users values('${owner}',true,'ordinary_member'),('${manager}',true,'chairperson'),('${inactive}',false,'ordinary_member');
      grant select on users to authenticated;
      create table leave_applications(id uuid primary key,user_id uuid not null,leave_type text not null,custom_leave_type text,leave_date date not null,reason text not null,drive_folder_url text,drive_file_url text,attachment_uploaded boolean not null,status text not null default 'pending',created_at timestamptz not null default now());
      insert into leave_applications(id,user_id,leave_type,leave_date,reason,attachment_uploaded)values('${record}','${owner}','sick','2026-10-20','Original',true);
      alter table leave_applications enable row level security;
      grant select,insert,update,delete on leave_applications to authenticated;
      create policy read_leave on leave_applications for select to authenticated using(true);
      create policy "Managers can update leave applications." on leave_applications for update to authenticated using(true) with check(true);
      create policy legacy_broad_update on leave_applications for update to authenticated using(true) with check(true);`)
    const sql=await readFile(new URL('../supabase_migration_2026_10_20_leave_owner_edit.sql',import.meta.url),'utf8')
    await db.exec(sql)
    await db.exec(sql)
    await as(owner)
    const before=(await db.query('select * from leave_applications')).rows[0]
    const updated=await db.query("update leave_applications set reason='Updated',leave_type='personal',drive_file_url='https://drive.google.com/file/d/test' where id=$1 and version=1 returning *",[record])
    assert.equal(updated.rows.length,1)
    assert.equal(updated.rows[0].version,2)
    assert.ok(updated.rows[0].updated_at)
    assert.equal(updated.rows[0].user_id,owner)
    assert.equal(updated.rows[0].status,before.status)
    assert.deepEqual(updated.rows[0].created_at,before.created_at)
    assert.equal((await db.query("update leave_applications set reason='Stale' where id=$1 and version=1 returning id",[record])).rows.length,0)
    for(const assignment of ["user_id='"+manager+"'","status='approved'","created_at=now()","version=100","drive_folder_url='https://untrusted.example'"]){
      await assert.rejects(db.exec(`update leave_applications set ${assignment} where id='${record}'`),/permission denied/)
    }
    for(const assignment of ["reason=' '","leave_type='invalid'","leave_type='custom',custom_leave_type=' '","attachment_uploaded=false","drive_file_url='javascript:alert(1)'"]){
      await assert.rejects(db.exec(`update leave_applications set ${assignment} where id='${record}'`),/LEAVE_INVALID_INPUT/)
    }
    for(const role of ['chairperson','advisor_teacher','ordinary_member']){
      await db.exec('reset role')
      await db.query('update users set role=$1 where id=$2',[role,manager])
      await as(manager)
      assert.equal((await db.query("update leave_applications set reason='Unauthorized' where id=$1 returning id",[record])).rows.length,0)
    }
    await as(inactive)
    assert.equal((await db.query("update leave_applications set reason='Inactive' where id=$1 returning id",[record])).rows.length,0)
    await db.exec(`reset role;update users set is_active=false where id='${owner}';`)
    await as(owner)
    assert.equal((await db.query("update leave_applications set reason='Revoked' where id=$1 returning id",[record])).rows.length,0)
    // Even an accidental broader column grant cannot change immutable fields.
    await db.exec(`reset role;update users set is_active=true where id='${owner}';grant update on leave_applications to authenticated;`)
    await as(owner)
    await assert.rejects(db.exec("update leave_applications set status='approved'"),/LEAVE_IMMUTABLE_FIELDS/)
    await as('', 'anon')
    await assert.rejects(db.exec("update leave_applications set reason='Anonymous'"),/permission denied/)
    await db.exec('reset role')
    assert.equal((await db.query('select reason from leave_applications')).rows[0].reason,'Updated')
  }finally{await db.close()}
})
