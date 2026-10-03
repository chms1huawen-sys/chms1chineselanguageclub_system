import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import process from 'node:process'
import { createClient } from '@supabase/supabase-js'

const project = 'xvzxewqeadppzsbczfak'
const apply = process.argv.includes('--apply')
const require = createRequire(import.meta.url)
const sharp = require(process.env.SHARP_MODULE || 'sharp')
// Credentials live only in memory and are never logged or saved to disk.
const command = `npx supabase projects api-keys --project-ref ${project} --reveal --output json`
const output = execFileSync('cmd.exe', ['/d', '/s', '/c', command], { encoding: 'utf8', timeout: 120000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
const keys = JSON.parse(output)
const key = keys.find(item => item.name === 'service_role' || item.name === 'secret')?.api_key
if (!key) throw new Error('No server credential available; no files changed.')
const db = createClient(`https://${project}.supabase.co`, key, { auth: { persistSession: false, autoRefreshToken: false } })
const bucket = db.storage.from('blog-photos')
const { data: photos, error } = await db.from('blog_media').select('id,path,original_path,display_path').is('display_path', null).is('original_path', null).order('id').limit(100)
if (error) throw new Error('Cannot read eligible photos; no files changed.')
console.log(JSON.stringify({ eligible: photos.length, apply }))
let inputBytes = 0
let displayBytes = 0
let optimized = 0
let skipped = 0
let failed = 0
for (const photo of photos) {
  if (!apply) continue
  try {
    if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(photo.path)) { skipped++; continue }
    const source = await bucket.download(photo.path)
    if (source.error) throw new Error('Source unavailable')
    const bytes = Buffer.from(await source.data.arrayBuffer())
    inputBytes += bytes.length
    if (inputBytes > 200 * 1024 * 1024) throw new Error('Safety download budget exceeded')
    const metadata = await sharp(bytes).metadata()
    if ((metadata.pages || 1) > 1) { skipped++; continue }
    const copy = await sharp(bytes).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer()
    if (copy.length >= bytes.length * 0.9) { skipped++; continue }
    const path = `${photo.path.split('/')[0]}/${randomUUID()}.webp`
    const uploaded = await bucket.upload(path, copy, { contentType: 'image/webp', cacheControl: '86400', upsert: false })
    if (uploaded.error) throw new Error('Display upload failed')
    const update = await db.from('blog_media').update({ display_path: path }).eq('id', photo.id).eq('path', photo.path).is('display_path', null).select('id')
    if (update.error || update.data.length !== 1) throw new Error('Reference update failed; original remains available')
    displayBytes += copy.length
    optimized++
    console.log(JSON.stringify({ optimized, originalBytes: bytes.length, displayBytes: copy.length }))
  } catch {
    failed++
    console.log(JSON.stringify({ failed, message: 'Skipped failed photo; original preserved.' }))
    if (inputBytes > 200 * 1024 * 1024) break
  }
}
console.log(JSON.stringify({ optimized, skipped, failed, downloadedBytes: inputBytes, displayBytes }))
if (failed) process.exitCode = 1
