import test from 'node:test'
import assert from 'node:assert/strict'
import { authErrorMessage } from '../src/utils/authErrorMessage.js'

test('login errors retain useful guidance without returning backend details', () => {
  assert.match(authErrorMessage({code:'invalid_credentials'}),/邮箱或密码/)
  assert.match(authErrorMessage({status:429},'en'),/Too many attempts/)
  assert.match(authErrorMessage({code:'over_request_rate_limit'}),/尝试次数/)
  for (const lang of ['zh','en']) {
    const message = authErrorMessage({message:'private DB query: secret-internal-path'},lang)
    assert.doesNotMatch(message,/secret-internal|private DB/)
    assert.ok(message.length > 0)
  }
})
