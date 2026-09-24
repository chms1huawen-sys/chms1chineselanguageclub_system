import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')

test('finance approval stages, receipts privacy, decimal ledger and duplicate payments', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth,storage to authenticated;
      create table users(id uuid primary key,name text,role text,is_active boolean default true);
      grant select,update on users to authenticated;
      create function public.current_user_has_permission(text) returns boolean language sql stable security definer as $$select exists(select 1 from users where id=auth.uid() and role='advisor_teacher')$$;
      create table notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,body text);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
      alter table storage.objects enable row level security;
      grant select,insert,delete on storage.objects to authenticated;
    `)
    const sql = await readFile(new URL('../supabase_migration_2026_09_23_finance.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    const reportSql = await readFile(new URL('../supabase_migration_2026_09_24_finance_reports.sql', import.meta.url), 'utf8')
    await db.exec(reportSql); await db.exec(reportSql)
    const formatSql = await readFile(new URL('../supabase_migration_2026_09_24_finance_format.sql', import.meta.url), 'utf8')
    await db.exec(formatSql); await db.exec(formatSql)
    const headingsSql = await readFile(new URL('../supabase_migration_2026_09_24_finance_report_headings.sql', import.meta.url), 'utf8')
    await db.exec(headingsSql); await db.exec(headingsSql)
    const [member,other,treasurer,president,teacher,custom] = Array.from({length:6},randomUUID)
    for (const [id,role] of [[member,'ordinary_member'],[other,'ordinary_member'],[treasurer,'treasurer'],[president,'chairperson'],[teacher,'advisor_teacher'],[custom,'custom']]) await db.query('insert into users(id,name,role) values($1,$2,$2)',[id,role])
    const as = async id => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated') }
    const mutate = async (action,data) => (await db.query('select finance_mutate($1,$2::jsonb) as result',[action,JSON.stringify({operation_id:randomUUID(),...data})])).rows[0].result
    const submit = async (actor,amount='21.80') => {
      await as(actor)
      const id=randomUUID(), path=`${actor}/${id}/receipt.png`
      await db.query("insert into storage.objects(bucket_id,name) values('finance-receipts',$1)",[path])
      await mutate('submit',{id,title:'Stationery',amount,expense_date:'2026-01-02',receipts:[{name:'receipt.png',path}]})
      return {id,path}
    }
    const request=await submit(member)
    await assert.rejects(mutate('income',{amount:100,description:'Forbidden',entry_date:'2026-01-01'}),/FINANCE_FORBIDDEN/)
    await assert.rejects(db.query('update users set can_manage_finance=true where id=$1',[member]),/FINANCE_FORBIDDEN/)
    await db.query('delete from storage.objects where name=$1',[request.path])
    assert.equal((await db.query('select * from storage.objects')).rows.length,1,'Submitted receipt cannot be deleted')
    await as(other)
    assert.equal((await db.query('select * from finance_claims')).rows.length,0)
    assert.equal((await db.query('select * from finance_receipts')).rows.length,0)
    assert.equal((await db.query('select * from storage.objects')).rows.length,0)
    await assert.rejects(db.query("select finance_statement('2026-01-01')"),/FINANCE_FORBIDDEN/)
    await assert.rejects(db.query("select finance_report('2026-01-01','2027-01-01')"),/FINANCE_FORBIDDEN/)
    await assert.rejects(db.query('select finance_report_years()'),/FINANCE_FORBIDDEN/)
    await assert.rejects(db.query("select finance_save_format('zh','x','x','x','x')"),/FINANCE_FORBIDDEN/)
    await assert.rejects(db.query('select finance_record_income($1)',[JSON.stringify({operation_id:randomUUID(),amount:1,entry_date:'2026-01-02',description:'No'})]),/FINANCE_FORBIDDEN/)
    await as(president)
    await assert.rejects(mutate('approve',{id:request.id,expected_status:'treasury'}),/FINANCE_FORBIDDEN/)
    await as(treasurer)
    assert.equal((await db.query('select * from storage.objects')).rows.length,1,'Finance staff can read linked receipt')
    await mutate('opening',{amount:'283.25',description:'Balance b/d',entry_date:'2026-01-01'})
    await mutate('income',{amount:'40.00',description:'Fees',entry_date:'2026-01-02'})
    const years = (await db.query('select finance_report_years() as years')).rows[0].years
    assert.ok(years.includes(2026))
    assert.equal(years.includes(2000),false)
    await mutate('approve',{id:request.id,expected_status:'treasury'})
    await assert.rejects(mutate('approve',{id:request.id,expected_status:'treasury'}),/FINANCE_STATUS_CHANGED/)
    await assert.rejects(mutate('approve',{id:request.id,expected_status:'president'}),/FINANCE_FORBIDDEN/)
    await as(president)
    await mutate('approve',{id:request.id,expected_status:'president'})
    await assert.rejects(mutate('approve',{id:request.id,expected_status:'teacher'}),/FINANCE_FORBIDDEN/)
    await as(teacher)
    await mutate('approve',{id:request.id,expected_status:'teacher'})
    assert.equal((await db.query("select * from finance_ledger where kind='expense'")).rows.length,0,'Approvals do not book unpaid expenses')
    await as(treasurer)
    const pay={id:request.id,expected_status:'approved',entry_date:'2026-01-03',note:'Bank transfer T001',operation_id:randomUUID()}
    await mutate('pay',pay); await mutate('pay',pay)
    await assert.rejects(mutate('pay',{...pay,operation_id:randomUUID()}),/FINANCE_STATUS_CHANGED/)
    assert.equal((await db.query("select * from finance_ledger where kind='expense'")).rows.length,1)
    const statement=(await db.query("select finance_statement('2026-01-01') as result")).rows[0].result
    assert.equal(Number(statement.opening),283.25); assert.equal(Number(statement.closing),301.45)
    await mutate('income',{amount:'10.10',description:'February income',entry_date:'2026-02-01'})
    const annual = (await db.query("select finance_report('2026-01-01','2027-01-01') as result")).rows[0].result
    assert.equal(Number(annual.closing),311.55)
    const january = (await db.query("select finance_report('2026-01-01','2026-02-01') as result")).rows[0].result
    assert.equal(Number(january.closing),301.45)
    assert.equal(Number((await db.query("select finance_statement('2026-02-01') as result")).rows[0].result.opening),301.45)
    await assert.rejects(db.query("update finance_ledger set amount=100"),/permission denied/)
    await assert.rejects(mutate('opening',{amount:1,description:'Duplicate',entry_date:'2026-01-01'}),/FINANCE_OPENING_EXISTS/)
    const own=await submit(treasurer)
    await assert.rejects(mutate('approve',{id:own.id,expected_status:'treasury'}),/FINANCE_SELF_APPROVAL/)
    const teacherOwn=await submit(teacher)
    for (const expected_status of ['treasury','president','teacher']) await mutate('approve',{id:teacherOwn.id,expected_status})
    await mutate('pay',{id:teacherOwn.id,expected_status:'approved',entry_date:'2026-01-04',note:'Cash'})
    const returned=await submit(member)
    await as(treasurer)
    await mutate('return',{id:returned.id,expected_status:'treasury',note:'Please correct the amount'})
    await as(member)
    await mutate('resubmit',{id:returned.id,title:'Corrected',amount:10,expense_date:'2026-01-02',receipts:[{name:'receipt.png',path:returned.path}]})
    assert.equal((await db.query('select status from finance_claims where id=$1',[returned.id])).rows[0].status,'treasury')
    await as(teacher)
    await db.query('update users set can_manage_finance=true where id=$1',[custom])
    await as(custom)
    await mutate('approve',{id:returned.id,expected_status:'treasury'})
    await as(teacher)
    await db.query('update users set is_active=false where id=$1',[custom])
    await as(custom)
    assert.equal((await db.query('select * from finance_claims')).rows.length,0)
    await assert.rejects(mutate('income',{amount:1,description:'Blocked',entry_date:'2026-01-02'}),/FINANCE_FORBIDDEN/)
    await as(president)
    const incomePayload = JSON.stringify({operation_id:randomUUID(),amount:'15.50',entry_date:'2026-07-01',description:'President income'})
    await db.query('select finance_record_income($1)',[incomePayload])
    await db.query('select finance_record_income($1)',[incomePayload])
    assert.equal((await db.query("select * from finance_ledger where description='President income'")).rows.length,1)
    const firstHalf = (await db.query("select finance_report('2026-01-01','2026-07-01') as report")).rows[0].report
    const secondHalf = (await db.query("select finance_report('2026-07-01','2027-01-01') as report")).rows[0].report
    assert.equal(Number(firstHalf.closing),Number(secondHalf.opening))
    assert.equal(Number(secondHalf.closing)-Number(secondHalf.opening),15.5)
    const before = JSON.stringify((await db.query('select * from finance_ledger order by id')).rows)
    await db.query("select finance_save_format('zh','年度收支','分类','明细','总计')")
    assert.equal((await db.query("select title from finance_report_format where lang='zh'")).rows[0].title,'年度收支')
    assert.equal((await db.query("select title from finance_report_format where lang='en'")).rows[0].title,'{year} Club Financial Report')
    await db.query("select finance_save_report_headings('zh','{year}年财政报告','','','合计','社团名称','华文学会')")
    const saved = (await db.query("select * from finance_report_format where lang='zh'")).rows[0]
    assert.equal(saved.club_name,'华文学会')
    assert.equal(saved.club_label,'社团名称')
    assert.equal(saved.category,'')
    assert.equal(JSON.stringify((await db.query('select * from finance_ledger order by id')).rows),before)
    await as(member)
    await assert.rejects(db.query("select finance_save_report_headings('zh','Blocked','','','合计','学会','test')"),/FINANCE_FORBIDDEN/)
  } finally { await db.close() }
})
