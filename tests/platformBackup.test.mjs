import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { secretNames, deploymentMetadata, validateStage } from '../scripts/prepare-platform-backup.mjs'

test('secret inventory projects names only, never secret values or digests', () => {
  const rows = secretNames([{ name: 'Z_SECRET', value: 'DO_NOT_EXPORT', digest: 'DO_NOT_EXPORT' }, { name: 'A_SECRET', api_key: 'DO_NOT_EXPORT' }])
  assert.deepEqual(rows, [{ name: 'A_SECRET', valueExported: false }, { name: 'Z_SECRET', valueExported: false }])
  assert.ok(!JSON.stringify(rows).includes('DO_NOT_EXPORT'))
  assert.throws(() => secretNames([{ name: '../secret' }]))
})
test('deployment inventory drops account contact and unexpected fields', () => {
  const rows = deploymentMetadata([{ id: 'deployment', created_on: 'time', author_email: 'private', token: 'private', versions: [{ version_id: 'version', percentage: 100, secret: 'private' }] }])
  assert.deepEqual(rows, [{ id: 'deployment', createdOn: 'time', versions: [{ id: 'version', percentage: 100 }] }])
})
test('configuration stage must be a direct, uniquely named child of its root', () => {
  const root = path.resolve('test-results/backup-root')
  validateStage(path.join(root, 'config-staging-20261018-150000-1234abcd'), root)
  for (const name of ['..', 'old-backup', 'nested/config-staging-20261018-150000-1234abcd']) assert.throws(() => validateStage(path.join(root, name), root))
})
