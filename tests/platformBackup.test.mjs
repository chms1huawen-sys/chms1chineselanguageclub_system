import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { secretNames, deploymentMetadata, validateStage, r2Configuration } from '../scripts/prepare-platform-backup.mjs'

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

test('R2 credentials can only be submitted to the fixed account and bucket', () => {
  const input = { endpoint: 'https://311949335986723af9a0a8b5bd76ebd4.r2.cloudflarestorage.com', bucket: 'chms1clc-photos', accessKeyId: 'A'.repeat(32), secretAccessKey: 'B'.repeat(64) }
  assert.equal(r2Configuration(input).region, 'auto')
  assert.equal(r2Configuration(input).credentials.accessKeyId, input.accessKeyId)
  for (const changed of [{ endpoint: 'https://external.example' }, { bucket: 'different' }, { secretAccessKey: '' }, { accessKeyId: 'line\nbreak' }]) assert.throws(() => r2Configuration({ ...input, ...changed }))
})
