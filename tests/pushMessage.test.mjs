import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFcmMessage } from '../supabase/functions/send-push-notification/message.js'

const notification = { id: 'notification-id', type: 'task_commented', title: 'Task comment', body: 'Update', dedupe_key: 'comment-recipient' }

test('task comments request high web push urgency and preserve visible notification and routing', () => {
  const { message } = buildFcmMessage(notification, 'device-token', '/member#/tasks', 'https://example.com/member#/tasks')
  assert.deepEqual(message.webpush.headers, { Urgency: 'high' })
  assert.deepEqual(message.notification, { title: notification.title, body: notification.body })
  assert.equal(message.token, 'device-token')
  assert.equal(message.data.notification_id, notification.id)
  assert.equal(message.data.url, '/member#/tasks')
  assert.equal(message.webpush.fcm_options.link, 'https://example.com/member#/tasks')
  assert.equal(message.webpush.notification.tag, notification.id)
  assert.equal(message.webpush.headers.TTL, undefined)
})

test('other notification types retain their existing delivery policy', () => {
  const { message } = buildFcmMessage({ ...notification, type: 'announcement', dedupe_key: null }, 'token', '/', 'https://example.com/')
  assert.equal(message.webpush.headers, undefined)
  assert.equal(message.data.dedupe_key, '')
})
