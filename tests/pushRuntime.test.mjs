import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { showForegroundPush, withPushTimeout } from '../src/utils/pushRuntime.js'
import { isInvalidFcmTokenError } from '../supabase/functions/send-push-notification/fcmErrors.js'

test('foreground push uses the service worker and preserves its target', async () => {
  const calls = []
  await showForegroundPush({ data: { title: 'Loan', body: 'Due', notification_id: 'n1', url: '/#/inventory' } }, {
    showNotification: async (...args) => calls.push(args),
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'Loan')
  assert.equal(calls[0][1].tag, 'n1')
  assert.equal(calls[0][1].data.url, '/#/inventory')
})

test('foreground failures remain observable', async () => {
  await assert.rejects(showForegroundPush({}, {
    showNotification: async () => { throw new Error('Permission revoked') },
  }), /Permission revoked/)
})

test('registration timeout bounds waiting and propagates other results', async () => {
  assert.equal(await withPushTimeout(Promise.resolve('ready'), 20), 'ready')
  await assert.rejects(withPushTimeout(Promise.reject(new Error('Offline')), 20), /Offline/)
  await assert.rejects(withPushTimeout(new Promise(() => {}), 5), /timed out/)
})

test('only explicit FCM UNREGISTERED errors deactivate devices', () => {
  const message = code => JSON.stringify({ error: { details: [{
    '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: code,
  }] } })
  assert.equal(isInvalidFcmTokenError(message('UNREGISTERED')), true)
  for (const code of ['INVALID_ARGUMENT', 'UNAVAILABLE', 'INTERNAL', 'SENDER_ID_MISMATCH']) {
    assert.equal(isInvalidFcmTokenError(message(code)), false)
  }
  assert.equal(isInvalidFcmTokenError('Requested entity was not found'), false)
  assert.equal(isInvalidFcmTokenError('{broken'), false)
  assert.equal(isInvalidFcmTokenError('null'), false)
})

test('background notification payloads are not displayed twice', async () => {
  let background
  const shown = []
  const listeners = {}
  vm.runInNewContext(await readFile(new URL('../public/firebase-messaging-sw.js', import.meta.url), 'utf8'), {
    importScripts() {},
    firebase: { initializeApp() {}, messaging: () => ({ onBackgroundMessage: fn => { background = fn } }) },
    self: {
      registration: { showNotification: async (...args) => shown.push(args) },
      addEventListener: (name, fn) => { listeners[name] = fn },
    },
  })
  await background({ notification: { title: 'Already displayed by Firebase' } })
  assert.equal(shown.length, 0)
  await background({ data: { title: 'Data-only', body: 'Reminder', url: '/#/tasks' } })
  assert.equal(shown.length, 1)
  assert.equal(shown[0][0], 'Data-only')
  let pending
  listeners.push({ data: { json: () => ({ title: 'Non-Firebase' }) }, waitUntil: promise => { pending = promise } })
  await pending
  assert.equal(shown.length, 2)
})
