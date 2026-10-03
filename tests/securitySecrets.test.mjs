import test from 'node:test'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { secretKinds } from '../scripts/security-secrets.mjs'

test('public anon JWT is not a server secret, service role is', () => {
  const jwt = role => `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({role})).toString('base64url')}.fakeSignature`
  assert.deepEqual(secretKinds(jwt('anon')), [])
  assert.deepEqual(secretKinds(jwt('service_role')), ['Supabase service_role JWT'])
})
test('scanner reports only kinds, not credential values', () => {
  assert.deepEqual(secretKinds(`sb_secret_${'x'.repeat(30)}`), ['Supabase secret key'])
  assert.deepEqual(secretKinds('SERVICE_ROLE_KEY=server-side-environment-reference'), [])
})
