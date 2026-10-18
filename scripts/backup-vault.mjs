import { spawnSync } from 'node:child_process'
import { readFile, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { validateStage } from './prepare-platform-backup.mjs'

export const VAULT_QUERY = `
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
SELECT json_build_object(
  'project', 'xvzxewqeadppzsbczfak',
  'exportedAt', now(),
  'secrets', (SELECT coalesce(json_agg(json_build_object('name', name,
    'value', decrypted_secret)), '[]'::json) FROM vault.decrypted_secrets
    WHERE name = 'inventory_cron_secret'),
  'jobs', (SELECT coalesce(json_agg(json_build_object('name', jobname,
    'schedule', schedule, 'command', command, 'active', active)), '[]'::json)
    FROM cron.job)
);
ROLLBACK;
`

export function validateVaultExport(data) {
  if (data?.project !== 'xvzxewqeadppzsbczfak' || !Number.isFinite(Date.parse(data.exportedAt)) ||
      !Array.isArray(data.secrets) || data.secrets.length !== 1 ||
      data.secrets[0]?.name !== 'inventory_cron_secret' || typeof data.secrets[0]?.value !== 'string' ||
      data.secrets[0].value.length < 32 || !Array.isArray(data.jobs) ||
      data.jobs.some(job => typeof job.name !== 'string' || typeof job.schedule !== 'string' ||
        typeof job.command !== 'string' || typeof job.active !== 'boolean')) {
    throw new Error('Vault recovery export is missing required data')
  }
  return { secretNames: ['inventory_cron_secret'], jobCount: data.jobs.length }
}

export async function exportVault(stage, root, pgBin) {
  validateStage(stage, root)
  validateStage(await realpath(stage), await realpath(root))
  if (!process.env.PGPASSWORD) throw new Error('Database password is required locally')
  // Never forward libpq service/URI settings or print database stdout/stderr: job commands can contain secrets.
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^PG/i.test(key)))
  Object.assign(env, { PGPASSWORD: process.env.PGPASSWORD, PGSSLMODE: 'require', PGCONNECT_TIMEOUT: '15',
    PGOPTIONS: '-c default_transaction_read_only=on', PGAPPNAME: 'chms1-readonly-recovery-export', PGCLIENTENCODING: 'UTF8' })
  const result = spawnSync(path.join(pgBin, 'psql.exe'), [
    '-X', '--no-password', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1',
    '--host=aws-1-ap-southeast-1.pooler.supabase.com', '--port=5432',
    '--username=postgres.xvzxewqeadppzsbczfak', '--dbname=postgres',
  ], { env, input: VAULT_QUERY, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024,
    windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
  if (result.status !== 0 || result.error) throw new Error('Read-only Vault export failed; no credentials were logged')
  let data
  try { data = JSON.parse(result.stdout.trim()) }
  catch { throw new Error('Invalid Vault export response; no response contents were logged') }
  const summary = validateVaultExport(data)
  const file = path.join(stage, 'credentials/vault-cron.json')
  await writeFile(file, JSON.stringify(data, null, 2), { flag: 'wx', mode: 0o600 })
  validateVaultExport(JSON.parse(await readFile(file, 'utf8')))
  const inventoryFile = path.join(stage, 'inventory.json')
  const inventory = JSON.parse(await readFile(inventoryFile, 'utf8'))
  inventory.vaultRecovery = { included: true, ...summary, exportedAt: data.exportedAt,
    scope: 'One named Vault secret plus cron definitions; Edge Secret equality and a full restore are not verified' }
  await writeFile(inventoryFile, JSON.stringify(inventory, null, 2))
  await writeFile(path.join(stage, 'VAULT-RESTORE-NOTES.txt'), [
    'SENSITIVE: credentials/vault-cron.json contains a plaintext secret and scheduler commands until encrypted.',
    'Use the exported inventory_cron_secret as INVENTORY_CRON_SECRET when rebuilding the Edge Functions.',
    'This does not prove equality with the current non-exportable Edge Secret or include all other Vault entries.',
    'Do not execute job commands during a restore drill. Keep cron, network hooks, email and push disabled.',
    'Recreate secrets and review scheduler definitions only in an isolated environment first.',
    'Existing platform supplement notes about missing remote values remain applicable except for this named Vault value.',
  ].join('\r\n'), { flag: 'wx' })
  console.log('Named Vault secret and scheduler definitions exported and validated. Production was read-only.')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  exportVault(...process.argv.slice(2)).catch(() => {
    console.error('Vault export did not complete. Preserve staging; no secret or server error was printed.')
    process.exitCode = 1
  })
}
