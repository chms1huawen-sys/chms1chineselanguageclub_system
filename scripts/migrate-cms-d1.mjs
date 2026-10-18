import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { CMS_TABLES, cmsRecordKey, validateCms } from '../server/cmsModel.js'

const mode = process.argv[2] || 'prepare'
const source = process.argv[3] || 'test-results/cms-source-export-20261019.json'
const input = validateCms(JSON.parse(await readFile(source,'utf8')))
const records = CMS_TABLES.flatMap(collection=>input[collection].map(row=>({collection,id:cmsRecordKey(collection,row),data:JSON.stringify(row)}))).sort((a,b)=>a.collection.localeCompare(b.collection)||a.id.localeCompare(b.id))
const fingerprint = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex')
const sha256 = fingerprint(records)
const quote = value => "'"+String(value).replaceAll("'","''")+"'"
const base = 'npx --offline wrangler d1 execute chms1clc-articles --remote --config cloudflare/public-preview/wrangler.jsonc'
function run(args) {
  const result=spawnSync(base+' '+args,{shell:true,encoding:'utf8',maxBuffer:10*1024*1024})
  if(result.status!==0)throw new Error('D1 migration command failed; original source preserved. '+(result.stderr||'').slice(0,1200))
  return result.stdout
}
const select = query => JSON.parse(run('--command "'+query+'" --json'))[0].results
if(mode==='prepare') {
  await mkdir('test-results',{recursive:true})
  const timestamp=new Date().toISOString()
  const sql = [
    '-- Private migration working file. Never publish or commit this file.',
    'INSERT INTO cms_state(id) SELECT 1 WHERE EXISTS(SELECT 1 FROM cms_records);',
    'CREATE TABLE IF NOT EXISTS cms_import_parts(collection TEXT,id TEXT,part INTEGER,chunk TEXT,PRIMARY KEY(collection,id,part));',
    'DELETE FROM cms_import_parts WHERE NOT EXISTS(SELECT 1 FROM cms_records);',
    ...records.flatMap(row=>Array.from({length:Math.ceil(row.data.length/8000)},(_,part)=>`INSERT INTO cms_import_parts(collection,id,part,chunk) VALUES(${quote(row.collection)},${quote(row.id)},${part},${quote(row.data.slice(part*8000,(part+1)*8000))});`)),
    "INSERT INTO cms_records(collection,id,data) SELECT p.collection,p.id,(SELECT group_concat(chunk,'') FROM (SELECT chunk FROM cms_import_parts q WHERE q.collection=p.collection AND q.id=p.id ORDER BY part)) FROM cms_import_parts p GROUP BY p.collection,p.id;",
    `UPDATE cms_state SET revision=1,active=0,imported_at=${quote(timestamp)},updated_at=${quote(timestamp)},import_hash=${quote(sha256)} WHERE id=1 AND active=0;`,
    'DROP TABLE cms_import_parts;',
  ].join('\n')
  if(sql.split('\n').some(line=>Buffer.byteLength(line)>95000))throw new Error('Record exceeds safe D1 SQL statement length')
  await writeFile('test-results/cms-import-20261019.sql',sql)
  console.log(JSON.stringify({prepared:true,rows:records.length,sha256,counts:Object.fromEntries(CMS_TABLES.map(table=>[table,input[table].length]))}))
}else if(mode==='import'){
  const state=select('SELECT active,revision,(SELECT count(*) FROM cms_records) AS records FROM cms_state WHERE id=1')[0]
  if(state.active || state.records)throw new Error('Refusing to overwrite an active or populated D1 CMS')
  run('--file test-results/cms-import-20261019.sql --yes')
  console.log('Imported into inactive D1 CMS. Verification and activation are separate steps.')
}else if(mode==='verify' || mode==='activate'){
  const actual=select('SELECT collection,id,data FROM cms_records ORDER BY collection,id').sort((a,b)=>a.collection.localeCompare(b.collection)||a.id.localeCompare(b.id))
  if(fingerprint(actual)!==sha256 || actual.length!==records.length)throw new Error('D1 content verification failed; refusing activation')
  if(mode==='activate'){
    run('--command "UPDATE cms_state SET active=1,updated_at=strftime(\'%Y-%m-%dT%H:%M:%fZ\',\'now\') WHERE id=1 AND active=0 AND import_hash=\''+sha256+'\'" --json')
    const state=select('SELECT active,revision FROM cms_state WHERE id=1')[0]
    if(state.active!==1)throw new Error('D1 activation not confirmed')
  }
  console.log(JSON.stringify({verified:true,active:mode==='activate',rows:actual.length,sha256}))
}else throw new Error('Unknown migration mode')
