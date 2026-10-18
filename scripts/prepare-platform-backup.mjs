import { execFileSync } from 'node:child_process'
import { constants, createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export function secretNames(rows) {
  if (!Array.isArray(rows) || rows.some(row => !/^[A-Z][A-Z0-9_]*$/.test(row.name || ''))) throw new Error('Invalid secret inventory')
  return rows.map(row => ({ name: row.name, valueExported: false })).sort((a, b) => a.name.localeCompare(b.name))
}
export function deploymentMetadata(rows) {
  if (!Array.isArray(rows)) throw new Error('Invalid deployment inventory')
  return rows.map(row => ({ id: row.id, createdOn: row.created_on,
    versions: (row.versions || []).map(version => ({ id: version.version_id, percentage: version.percentage })) }))
}
export function validateStage(stage, root) {
  if (path.dirname(path.resolve(stage)) !== path.resolve(root) || !/^config-staging-\d{8}-\d{6}-[a-f0-9]{8}$/.test(path.basename(stage))) throw new Error('Invalid configuration staging path')
}
function jsonCommand(command) {
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-Command', command + '; exit $LASTEXITCODE'],
    { cwd: repo, windowsHide: true, encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }))
}
async function archiveHash(file) {
  const expected = (await readFile(file + '.sha256', 'utf8')).match(/[a-f0-9]{64}/i)?.[0].toLowerCase()
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  const actual = hash.digest('hex')
  if (!expected || expected !== actual) throw new Error('Existing archive checksum mismatch')
  return { file: path.basename(file), sha256: actual, integrityOnlyNotRestore: true }
}
export async function prepare(stage, root) {
  validateStage(stage, root)
  const resolvedRoot = await realpath(root)
  const resolvedStage = await realpath(stage)
  validateStage(resolvedStage, resolvedRoot)
  if ((await readdir(stage)).length) throw new Error('Configuration staging directory must be empty')
  const inventoryFile = 'docs/PLATFORM_RECOVERY_INVENTORY_2026_10_18.json'
  const inventory = JSON.parse(await readFile(path.join(repo, inventoryFile), 'utf8'))
  const secrets = secretNames(jsonCommand('& npx.cmd --offline supabase secrets list --project-ref xvzxewqeadppzsbczfak --output json'))
  const deployments = deploymentMetadata(jsonCommand('& npx.cmd --offline wrangler deployments list --config cloudflare/public-preview/wrangler.jsonc --json'))
  const functions = jsonCommand('& npx.cmd --offline supabase functions list --project-ref xvzxewqeadppzsbczfak --output json')
    .map(row => ({ id: row.id, name: row.name, slug: row.slug, status: row.status, version: row.version, verifyJwt: row.verify_jwt }))
  const archives = []
  for (const name of ['CHMS1-20261018-143106-83921fae.7z', inventory.firebase.existingEncryptedCredentialArchive]) archives.push(await archiveHash(path.join(root, name)))
  const files = [inventoryFile, 'vercel.json', 'supabase/config.toml', 'cloudflare/public-preview/wrangler.jsonc',
    'cloudflare/public-preview/worker.js', 'cloudflare/public-preview/securityHeaders.js', 'public/manifest.json',
    'public/manifest-blog.json', 'public/firebase-messaging-sw.js', 'docs/PUBLIC_LAUNCH_RUNBOOK.md',
    'scripts/backup-to-harddisk.ps1', 'scripts/backup-storage.mjs', 'scripts/backup-platform-to-harddisk.ps1',
    'scripts/prepare-platform-backup.mjs']
  for (const file of files) {
    const destination = path.join(stage, 'configuration', file)
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(path.join(repo, file), destination, constants.COPYFILE_EXCL)
  }
  await mkdir(path.join(stage, 'credentials'))
  await copyFile(path.join(repo, '.env.local'), path.join(stage, 'credentials/local-environment.txt'), constants.COPYFILE_EXCL)
  const credential = JSON.parse(await readFile(path.join(repo, inventory.firebase.localCredentialFile), 'utf8'))
  if (credential.type !== 'service_account' || credential.project_id !== inventory.firebase.projectId || !credential.private_key) throw new Error('Local Firebase credential mismatch')
  await copyFile(path.join(repo, inventory.firebase.localCredentialFile), path.join(stage, 'credentials/firebase-service-account.json'), constants.COPYFILE_EXCL)
  execFileSync('git', ['archive', '--format=zip', '--output=' + path.join(stage, 'source.zip'), 'HEAD'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim()
  await writeFile(path.join(stage, 'inventory.json'), JSON.stringify({ preparedAt: new Date().toISOString(), commit,
    completeness: 'PARTIAL: configuration and local credentials; outstanding remote values are not exported',
    supabaseSecretNames: secrets, edgeFunctions: functions, cloudflareDeployments: deployments,
    verifiedPriorArchives: archives, scope: inventory }, null, 2), { flag: 'wx' })
  await writeFile(path.join(stage, 'RESTORE-NOTES.txt'), [
    'PARTIAL PLATFORM CONFIGURATION SUPPLEMENT - not a complete secrets or database backup.',
    'Keep together with the referenced database/Storage and Firebase encrypted archives.',
    'Local environment values and a validated local Firebase JSON are included; their equality with current remote values is NOT verified.',
    'R2 endpoint/bucket and configuration are recorded; the two original R2 credential values remain missing.',
    'Supabase secret names are NOT secret values. Obtain original custom secrets and Vault recovery material from the owner.',
    'Do not upload the unencrypted staging directory. Do not restore into production or enable mail/push/cron during a test restore.',
    'No platform settings, keys, domains or permissions were changed by preparation.',
  ].join('\r\n'), { flag: 'wx' })
  console.log('Configuration supplement prepared. Missing remote secrets remain explicitly listed. No credential values were printed.')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await prepare(process.argv[2], process.argv[3]) }
  catch { console.error('Configuration preparation failed. Staging may contain unencrypted credentials; do not share or disconnect before review.'); process.exitCode = 1 }
}
