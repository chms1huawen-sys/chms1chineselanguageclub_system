import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
const db=new PGlite()
try {
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create function auth.uid() returns int language sql as $$ select 1 $$;
 create function current_user_has_permission(text) returns boolean language sql as $$ select true $$;
 create function finance_access(text) returns boolean language sql as $$ select true $$;
 create function finance_report(date,date) returns jsonb language sql as $$ select jsonb_build_object('start',$1,'end',$2,'entries','[]'::jsonb) $$;
 create table users(id int,name text,role text,custom_role_label text,is_active boolean);
 insert into users values(1,'Teacher','advisor_teacher',null,true);
 create table teams(id int,name text,session text,type text,is_archived boolean,start_date date,end_date date,created_at timestamptz default now());
 insert into teams(id,name,session,type,is_archived) values(1,'Current','2026-H2','board',false),(2,'Old','2025-H1','board',true);
 create table team_members(team_id int,user_id int,position text);
 create table leave_applications(user_id int,leave_date date); insert into leave_applications values(1,'2026-06-30'),(1,'2026-07-01'),(1,'2027-01-01');
 create table events(title text,date date,type text,notes text); insert into events values('Activity','2026-07-01','event','Note'),('Task','2026-07-01','deadline','Excluded');
 create table inventory_categories(id int,name text); insert into inventory_categories values(1,'Stationery');
 create table inventory_items(name text,category_id int,available int,reserved int,on_loan int,unit text); insert into inventory_items values('Pens',1,10,2,1,'pcs');
 create table finance_report_format(lang text);`)
 const sql=await readFile(new URL('../supabase_migration_2026_09_24_term_report.sql',import.meta.url),'utf8')
 await db.exec(sql);await db.exec(sql)
 const r=(await db.query('select club_term_report(2026,2) r')).rows[0].r
 assert.equal(r.leaves.length,1);assert.equal(r.events.length,1);assert.equal(r.events[0].title,'Activity')
 assert.equal(r.rosters.length,1);assert.equal(r.rosters[0].members.length,1)
 assert.equal(r.finance.start,'2026-01-01');assert.equal(r.finance.end,'2027-01-01')
 assert.equal(r.inventory[0].available,10);assert.equal('tasks' in r,false)
 await assert.rejects(db.query('select club_term_report(2026,3)'),/REPORT_PERIOD_INVALID/)
 await db.exec('update users set is_active=false')
 await assert.rejects(db.query('select club_term_report(2026,2)'),/REPORT_FORBIDDEN/)
 console.log('Report period boundaries, full-year finance, no tasks, current stock and inactive-account denial passed.')
} finally {await db.close()}
