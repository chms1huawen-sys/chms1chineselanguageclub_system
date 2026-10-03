import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import process from 'node:process'

export function secretKinds(text) {
  const kinds = new Set()
  for (const jwt of text.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+/g)) {
    try { if (JSON.parse(Buffer.from(jwt[1], 'base64url').toString()).role === 'service_role') kinds.add('Supabase service_role JWT') } catch { /* Not a JWT. */ }
  }
  if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(text)) kinds.add('Supabase secret key')
  if (/(?:ghp_|github_pat_)[A-Za-z0-9_]{30,}/.test(text)) kinds.add('GitHub token')
  if (/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----\s+[A-Za-z0-9+/=\s]{80,}-----END (?:RSA |EC )?PRIVATE KEY-----/.test(text.replace(/\\n/g, '\n'))) kinds.add('Private key')
  if (/AKIA[0-9A-Z]{16}/.test(text)) kinds.add('AWS access key ID')
  return [...kinds]
}

export function scanGitSecrets() {
  const listing = execFileSync('git', ['rev-list', '--objects', '--all'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  const objects = listing.trim().split('\n').map(line => {
    const space = line.indexOf(' ')
    return { oid: line.slice(0, space), path: line.slice(space + 1) }
  }).filter(item => /(?:\.(?:js|jsx|ts|tsx|mjs|json|sql|md|yaml|yml|toml|pem|key|txt)|(?:^|\/)\.env[^/]*)$/.test(item.path) && /^[a-f0-9]{40}$/.test(item.oid))
  const data = execFileSync('git', ['cat-file', '--batch'], { input: objects.map(item => item.oid).join('\n') + '\n', maxBuffer: 200 * 1024 * 1024 })
  let offset = 0
  const findings = []
  for (const object of objects) {
    const end = data.indexOf(10, offset)
    const header = data.subarray(offset, end).toString().split(' ')
    const size = Number(header[2])
    if (!Number.isFinite(size)) throw new Error('Could not inspect Git object')
    const kinds = secretKinds(data.subarray(end + 1, end + 1 + size).toString())
    if (kinds.length) findings.push({ path: object.path, object: object.oid.slice(0, 12), kinds })
    offset = end + 1 + size + 1
  }
  const frontendEnvironment = []
  const workingTree = []
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n')
  for (const path of files) {
    if (!/\.(js|jsx|ts|tsx|mjs|json|sql|md|yaml|yml|toml|pem|key|txt)$/.test(path) || !existsSync(path)) continue
    const kinds = secretKinds(readFileSync(path, 'utf8'))
    if (kinds.length) workingTree.push({ path, kinds })
  }
  for (const file of ['.env.local', '.env', '.env.production']) {
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*((?:VITE_|NEXT_PUBLIC_)[A-Z0-9_]+)\s*=\s*(.*)$/)
      if (match && secretKinds(match[2]).length) frontendEnvironment.push({ file, variable: match[1], kinds: secretKinds(match[2]) })
    }
  }
  return { inspectedHistoricalTextObjects: objects.length, historicalFindings: findings, workingTreeFindings: workingTree, exposedEnvironmentFindings: frontendEnvironment }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = scanGitSecrets()
  console.log(JSON.stringify(result, null, 2))
  if (result.historicalFindings.length || result.workingTreeFindings.length || result.exposedEnvironmentFindings.length) process.exitCode = 1
}
