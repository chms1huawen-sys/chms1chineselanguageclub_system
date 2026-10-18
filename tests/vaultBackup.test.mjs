import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { VAULT_QUERY, validateVaultExport } from '../scripts/backup-vault.mjs'

test('Vault export requires the named original secret and valid scheduler metadata', () => {
  const data = { project: 'xvzxewqeadppzsbczfak', exportedAt: '2026-10-18T10:00:00Z',
    secrets: [{ name: 'inventory_cron_secret', value: 'fixture-only-'.repeat(4) }],
    jobs: [{ name: 'push-retry', schedule: '*/5 * * * *', command: 'select 1', active: true }] }
  assert.deepEqual(validateVaultExport(data), { secretNames: ['inventory_cron_secret'], jobCount: 1 })
  for (const change of [{ project: 'wrong' }, { secrets: [] }, { secrets: [{ name: 'inventory_cron_secret', value: '' }] },
    { secrets: [...data.secrets, ...data.secrets] }, { exportedAt: '' }, { jobs: [{ name: 'unsafe' }] }]) {
    assert.throws(() => validateVaultExport({ ...data, ...change }), /missing required data/)
  }
})

test('recovery SQL reads only the required Vault entry and does not execute jobs', async () => {
  const db = new PGlite()
  try {
    await db.exec(`CREATE SCHEMA vault; CREATE SCHEMA cron;
      CREATE TABLE vault.decrypted_secrets(name text, decrypted_secret text);
      CREATE TABLE cron.job(jobname text, schedule text, command text, active boolean);
      INSERT INTO vault.decrypted_secrets VALUES ('inventory_cron_secret', repeat('fixture', 8)), ('unrelated', 'omit-me');
      INSERT INTO cron.job VALUES ('test', '* * * * *', 'THIS MUST NEVER EXECUTE', true);`)
    const results = await db.exec(VAULT_QUERY)
    const row = results.flatMap(result => result.rows).find(item => item.json_build_object)
    assert.equal(validateVaultExport(row.json_build_object).jobCount, 1)
    assert.equal(JSON.stringify(row).includes('omit-me'), false)
    assert.match(VAULT_QUERY, /BEGIN READ ONLY/)
    assert.match(VAULT_QUERY, /ROLLBACK/)
    assert.equal((await db.query('select count(*)::int as count from cron.job')).rows[0].count, 1)
  } finally { await db.close() }
})
