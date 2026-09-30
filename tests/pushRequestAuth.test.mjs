import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizePushRequest } from '../supabase/functions/send-push-notification/requestAuth.js'

test('only the exact server key bypasses user verification', async () => {
  assert.equal(await authorizePushRequest({}, 'secret', 'secret'), 200)
  assert.equal(await authorizePushRequest({}, '', 'secret'), 401)
})

test('invalid login, disabled accounts and profile lookup errors fail closed', async () => {
  const client = (active, error = null) => ({
    auth: { getUser: async () => ({ data: { user: { id: 'member' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { is_active: active }, error }) }) }) }),
  })
  assert.equal(await authorizePushRequest(client(true), 'login', 'secret'), 200)
  assert.equal(await authorizePushRequest(client(false), 'login', 'secret'), 403)
  assert.equal(await authorizePushRequest(client(true, new Error('offline')), 'login', 'secret'), 403)
  assert.equal(await authorizePushRequest({ auth: { getUser: async () => ({ error: new Error('invalid') }) } }, 'fake', 'secret'), 401)
})
