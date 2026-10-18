import { mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { CMS_TABLES, validateCms } from '../server/cmsModel.js'

await mkdir('test-results',{recursive:true})
const sql='select jsonb_build_object('+CMS_TABLES.map(table=>`'${table}',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from public.${table} t)`).join(',')+') as cms_export;'
await writeFile('test-results/cms-export-query.sql',sql)
const command='npx --offline supabase db query --linked --project-ref xvzxewqeadppzsbczfak --file test-results/cms-export-query.sql --output json'
const result=spawnSync('cmd.exe',['/d','/s','/c',command],{encoding:'utf8',maxBuffer:10*1024*1024})
if(result.status!==0)throw new Error('Supabase export failed; no cutover performed. '+(result.stderr||'').slice(0,500))
const data=validateCms(JSON.parse(result.stdout).rows[0].cms_export)
const body=JSON.stringify(data)
await writeFile(process.argv[2]||'test-results/cms-source-export-20261019.json',body)
console.log(JSON.stringify({exported:true,bytes:Buffer.byteLength(body),sha256:createHash('sha256').update(body).digest('hex'),counts:Object.fromEntries(CMS_TABLES.map(table=>[table,data[table].length]))}))
