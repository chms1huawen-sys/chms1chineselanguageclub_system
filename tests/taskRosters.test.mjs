import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {taskRosterOptions, taskRosterName, isExecutiveAccount} from '../src/utils/taskRosters.js'
const team={id:'b',type:'board',session:'2026-H2',name:'Existing'}
const options=taskRosterOptions([team,{id:'e',type:'event',name:'Committee'}],{role:'chairperson'})
assert.equal(options.length,3)
assert.equal(options[0].task_scope,'members')
assert.equal(taskRosterName(options[0],'zh'),'一中华文学会 2026 下半年 会员名单')
assert.equal(taskRosterOptions([team],{role:'ordinary_member'}).length,1)
assert.equal(isExecutiveAccount({role:'ordinary_member'}),false)
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite')
const db=new PGlite()
try {
 await db.exec(`create table teams(id int primary key,type text); create table users(id int primary key,is_active boolean,role text); create table tasks(id int primary key,team_id int,assigned_to int[],status text); insert into teams values(1,'board'),(2,'event'); insert into users values(1,true,'chairperson'),(2,true,'ordinary_member'); insert into tasks values(1,1,array[2],'pending'),(2,2,array[2],'pending');`)
 const sql=await readFile(new URL('../supabase_migration_2026_09_24_task_roster_scopes.sql',import.meta.url),'utf8')
 await db.exec(sql); await db.exec(sql)
 assert.equal((await db.query('select task_scope from tasks where id=1')).rows[0].task_scope,'members')
 await db.exec("update tasks set status='completed' where id=1")
 await db.exec("insert into tasks values(3,1,array[2],'pending','members')")
 await assert.rejects(db.exec("insert into tasks values(4,1,array[2],'pending','executive')"),/TASK_ROSTER_ASSIGNEE_INVALID/)
 await db.exec("insert into tasks values(5,1,array[1],'pending','executive')")
 await db.exec("update tasks set status='completed' where id=2")
 console.log('Roster options, term names, legacy preservation, separate assignments, committee preservation and repeat migration passed.')
} finally {await db.close()}
