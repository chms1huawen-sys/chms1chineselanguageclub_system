import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')

test('inventory transactions, role checks, privacy and stock conservation', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth; create schema storage;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      create table public.users(id uuid primary key,name text,role text,is_active boolean default true,can_manage_accounts boolean default false);
      create function public.current_user_has_permission(text) returns boolean language sql stable security definer as $$
        select exists(select 1 from public.users where id=auth.uid() and (role='advisor_teacher' or can_manage_accounts)); $$;
      create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid,type text,title text,body text,dedupe_key text unique);
      create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
      create table storage.objects(id uuid,bucket_id text);
      grant select,update on public.users to authenticated;
    `)
    const sql = await readFile(new URL('../supabase_migration_2026_09_23_inventory.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql)
    const member = randomUUID(), other = randomUUID(), teacher = randomUUID(), president = randomUUID(), custom = randomUUID()
    for (const [id, name, role] of [[member,'Member','ordinary_member'],[other,'Other','ordinary_member'],[teacher,'Teacher','advisor_teacher'],[president,'President','chairperson'],[custom,'Custom','custom']]) {
      await db.query('insert into users(id,name,role) values($1,$2,$3)', [id,name,role])
    }
    const as = async id => {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
      await db.exec('set role authenticated')
    }
    const mutate = async (action, data) => (await db.query('select inventory_mutate($1,$2::jsonb) as result', [action, JSON.stringify({ operation_id: randomUUID(), ...data })])).rows[0].result
    const stock = async id => (await db.query('select available,reserved,on_loan,damaged,lost from inventory_items where id=$1',[id])).rows[0]
    await as(teacher)
    const category = (await mutate('category',{ name:'Stationery' })).id
    const item = (await mutate('item',{ name:'Scissors',category_id:category,mode:'loan',quantity:5 })).id
    const paper = (await mutate('item',{ name:'Paper',category_id:category,mode:'consumable',quantity:20 })).id
    await assert.rejects(mutate('item',{ name:'Serial',category_id:category,mode:'loan',asset_code:'A1',quantity:2 }), /check constraint/)
    const today = (await db.query("select (now() at time zone 'Asia/Kuala_Lumpur')::date::text as today")).rows[0].today
    const submit = (id, lines) => mutate('submit',{ id,purpose:'Activity',pickup_date:today,due_date:today,lines })
    await as(member)
    await assert.rejects(mutate('category',{ name:'Forbidden' }), /INVENTORY_FORBIDDEN/)
    await assert.rejects(db.query('update users set can_manage_inventory=true where id=$1',[member]), /INVENTORY_FORBIDDEN/)
    await assert.rejects(db.query('update inventory_items set available=100'), /permission denied/)
    const req = randomUUID()
    await submit(req,[{ item_id:item,quantity:3 },{ item_id:paper,quantity:4 }])
    await submit(req,[{ item_id:item,quantity:3 },{ item_id:paper,quantity:4 }])
    assert.equal((await db.query('select * from inventory_requests')).rows.length,1)
    await assert.rejects(mutate('approve',{ id:req }), /INVENTORY_SELF_APPROVAL/)
    await as(other)
    assert.equal((await db.query('select * from inventory_requests')).rows.length,0)
    assert.equal((await db.query('select * from inventory_request_lines')).rows.length,0)
    await assert.rejects(mutate('cancel',{ id:req }), /INVENTORY_FORBIDDEN/)
    const competing = randomUUID()
    await submit(competing,[{ item_id:item,quantity:4 }])
    await as(president)
    const own = randomUUID()
    await submit(own,[{ item_id:item,quantity:1 }])
    await assert.rejects(mutate('approve',{ id:own }), /INVENTORY_SELF_APPROVAL/)
    await mutate('approve',{ id:req })
    assert.deepEqual(await stock(item), {available:2,reserved:3,on_loan:0,damaged:0,lost:0})
    await assert.rejects(mutate('approve',{ id:competing }), /INVENTORY_STOCK_UNAVAILABLE/)
    await assert.rejects(mutate('adjust',{id:item,available:-3,note:'Count'}), /check constraint/)
    await mutate('issue',{ id:req })
    await assert.rejects(db.query('select inventory_due_reminders()'), /permission denied/)
    await db.exec('reset role')
    const reminders = (await db.query('select inventory_due_reminders() as ids')).rows[0].ids
    assert.ok(reminders.length >= 2)
    assert.deepEqual((await db.query('select inventory_due_reminders() as ids')).rows[0].ids, [])
    await as(president)
    assert.deepEqual(await stock(item), {available:2,reserved:0,on_loan:3,damaged:0,lost:0})
    assert.equal((await stock(paper)).available,16)
    await assert.rejects(mutate('issue',{ id:req }), /INVENTORY_STATUS_CHANGED/)
    const lines = (await db.query('select * from inventory_request_lines where request_id=$1',[req])).rows
    const loan = lines.find(l => l.item_id === item), consumable = lines.find(l => l.item_id === paper)
    const partial = { id:req,operation_id:randomUUID(),lines:[{id:loan.id,good:1}] }
    await mutate('return',partial)
    await mutate('return',partial)
    assert.equal((await stock(item)).on_loan,2)
    await assert.rejects(mutate('return',{id:req,lines:[{id:loan.id,good:3}]}),/INVENTORY_RETURN_INVALID/)
    await mutate('return',{id:req,note:'Damaged and missing',lines:[{id:loan.id,damaged:1,lost:1},{id:consumable.id,good:2}]})
    assert.deepEqual(await stock(item), {available:3,reserved:0,on_loan:0,damaged:1,lost:1})
    assert.equal((await stock(paper)).available,18)
    assert.equal((await db.query('select status from inventory_requests where id=$1',[req])).rows[0].status,'closed')
    await mutate('approve',{id:own}) .then(() => assert.fail('Self approval should fail'), err => assert.match(err.message,/INVENTORY_SELF_APPROVAL/))
    await as(teacher)
    const teacherOwn = randomUUID()
    await submit(teacherOwn,[{ item_id:item,quantity:1 }])
    await mutate('approve',{id:teacherOwn})
    await mutate('cancel',{id:teacherOwn})
    assert.equal((await stock(item)).available,3)
    await db.query('update users set can_approve_inventory=true where id=$1',[custom])
    await as(custom)
    await mutate('approve',{id:own})
    await assert.rejects(mutate('issue',{id:own}),/INVENTORY_FORBIDDEN/)
    await as(teacher)
    await db.query('update users set is_active=false where id=$1',[custom])
    await as(custom)
    assert.equal((await db.query('select * from inventory_requests')).rows.length,0)
    await assert.rejects(mutate('approve',{id:competing}),/INVENTORY_FORBIDDEN/)
    console.log('Verified: migration reruns, teacher self-approval, non-teacher restriction, RLS privacy, custom grants, deactivation, stock reservation, rollback, partial returns, damage/loss, consumable returns, duplicate retries.')
  } finally { await db.close() }
})
