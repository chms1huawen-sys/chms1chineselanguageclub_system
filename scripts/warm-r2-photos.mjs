import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { validPhotoTarget, photoKey } from '../server/r2Photos.js'

export function validateWarmPlan(plan, site) {
  const url = new URL(site)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Use the HTTPS production origin only')
  if (plan.schemaVersion !== 1 || plan.blocked?.length !== 0 || !Array.isArray(plan.files) || plan.files.length > 1000 || plan.files.length !== plan.totals?.files) throw new Error('Incomplete photo plan')
  const seen = new Set()
  let total = 0
  for (const file of plan.files) {
    if (!validPhotoTarget(file.bucket, file.path) || file.targetKey !== photoKey(file.bucket, file.path) || seen.has(file.targetKey) ||
        !Number.isSafeInteger(file.bytes) || file.bytes <= 0 || file.bytes > 10 * 1024 * 1024) throw new Error('Invalid photo plan entry')
    seen.add(file.targetKey)
    total += file.bytes
  }
  if (total !== plan.totals.bytes || total > 30 * 1024 * 1024) throw new Error('Transfer budget exceeded; review a fresh plan')
  return url.origin
}

export async function warmPhoto(file, origin, request = fetch) {
  const url = new URL('/api/blog-media', origin)
  url.search = new URLSearchParams({ bucket: file.bucket, path: file.path, format: 'json' })
  const response = await request(url, { signal: AbortSignal.timeout(45000), redirect: 'error', cache: 'no-store' })
  if (!response.ok) throw new Error('Gateway unavailable or image no longer public')
  const result = await response.json()
  if (result.provider !== 'r2') throw new Error('R2 not active; destination is not verified')
  const verified = result.verification
  if (verified?.bytes !== file.bytes || verified?.contentType !== file.contentType || !/^[a-f0-9]{64}$/.test(verified?.sha256 || '')) throw new Error('Plan or verification mismatch')
  const destination = new URL(result.data.signedUrl)
  if (destination.protocol !== 'https:' || !destination.hostname.endsWith('.r2.cloudflarestorage.com') || destination.username || destination.password) throw new Error('Unexpected destination')
  const downloaded = await request(destination, { signal: AbortSignal.timeout(15000), redirect: 'error' })
  if (!downloaded.ok || Number(downloaded.headers.get('content-length')) !== file.bytes || downloaded.headers.get('content-type')?.split(';')[0] !== file.contentType) throw new Error('Destination size or type mismatch')
  const reader = downloaded.body.getReader()
  const hash = createHash('sha256')
  let bytes = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > file.bytes) { await reader.cancel(); throw new Error('Destination limit exceeded') }
      hash.update(next.value)
    }
  } finally { reader.releaseLock() }
  if (bytes !== file.bytes || hash.digest('hex') !== verified.sha256) throw new Error('Destination checksum mismatch')
  return { targetKey: file.targetKey, bytes, sha256: verified.sha256, status: 'verified' }
}

async function main() {
  const [planFile, site, output] = process.argv.slice(2)
  if (!planFile || !site || !output || process.argv.length !== 5) throw new Error('Usage: node scripts/warm-r2-photos.mjs PLAN HTTPS_SITE OUTPUT')
  const plan = JSON.parse(await readFile(planFile, 'utf8'))
  const origin = validateWarmPlan(plan, site)
  const reportPath = resolve(output)
  await mkdir(dirname(reportPath), { recursive: true })
  // Reserve the report before the first remote write; never replace an earlier report.
  const report = { startedAt: new Date().toISOString(), verified: [], complete: false }
  await writeFile(reportPath, JSON.stringify(report, null, 2), { flag: 'wx' })
  try {
    for (const file of plan.files) {
      report.verified.push(await warmPhoto(file, origin))
      await writeFile(reportPath, JSON.stringify(report, null, 2))
      console.log(`Verified ${report.verified.length}/${plan.files.length}`)
    }
    report.complete = true
  } finally {
    report.finishedAt = new Date().toISOString()
    await writeFile(reportPath, JSON.stringify(report, null, 2))
  }
  console.log(`R2 verification complete: ${report.verified.length} images. Source files preserved.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('R2 transfer stopped. Check configuration, deployment and the local report. No source files were deleted or overwritten.'); process.exitCode = 1 })
}
