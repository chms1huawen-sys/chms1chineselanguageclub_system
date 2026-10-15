import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { photoCandidates, buildPhotoPlan } from './lib/r2-photo-plan.mjs'

export async function readPages(makeQuery) {
  const rows = []
  for (let offset = 0; offset < 100000; offset += 500) {
    const result = await makeQuery().range(offset, offset + 499)
    if (result.error) throw new Error('Could not read photo inventory metadata; no remote changes made.')
    rows.push(...result.data)
    if (result.data.length < 500) return rows
  }
  throw new Error('Inventory limit reached; refusing an incomplete plan.')
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length !== 2 || args[0] !== '--output') throw new Error('Usage: node --env-file=.env.local scripts/prepare-r2-photos.mjs --output backups/r2-photos-plan.json')
  const output = resolve(args[1])
  const projectUrl = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY
  if (!projectUrl || !key) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY locally. Do not provide service-role or R2 credentials.')
  // Anonymous access retains the production published-content RLS boundary.
  const db = createClient(projectUrl, key, { auth: { persistSession: false, autoRefreshToken: false } })
  const posts = await readPages(() => db.from('blog_posts').select('id,status,cover_path').eq('status', 'published').order('id'))
  const albums = await readPages(() => db.from('blog_albums').select('id,status,cover_path').eq('status', 'published').order('id'))
  const media = await readPages(() => db.from('blog_media').select('id,post_id,album_id,path,display_path').order('id'))
  const settingsResult = await db.from('blog_settings').select('hero_path,content').eq('id', 1).single()
  if (settingsResult.error) throw new Error('Could not read public site settings.')
  const input = { posts, albums, media, settings: settingsResult.data, projectUrl }
  const { candidates } = photoCandidates(input)
  const folders = new Map(candidates.map(row => [`${row.bucket}/${row.path.slice(0, row.path.lastIndexOf('/'))}`, { bucket: row.bucket, prefix: row.path.slice(0, row.path.lastIndexOf('/')) }]))
  const objects = []
  for (const { bucket, prefix } of folders.values()) {
    let complete = false
    for (let offset = 0; offset < 100000; offset += 500) {
      const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 500, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw new Error('Could not read Storage metadata; no images downloaded.')
      for (const row of data) if (row.id) objects.push({ bucket, path: `${prefix}/${row.name}`, metadata: row.metadata })
      if (data.length < 500) { complete = true; break }
    }
    if (!complete) throw new Error('Storage inventory limit reached; refusing an incomplete plan.')
  }
  const plan = buildPhotoPlan(input, objects)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(plan, null, 2)}\n`, { flag: 'wx' })
  console.log(JSON.stringify({ mode: plan.mode, ...plan.totals, imageDownloads: 0, remoteWrites: 0 }))
  if (plan.blocked.length) process.exitCode = 2
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Preparation failed. Check local configuration and metadata access. No remote changes made; existing reports are never overwritten.'); process.exitCode = 1 })
}
