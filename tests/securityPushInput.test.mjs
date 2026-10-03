import test from 'node:test'
import assert from 'node:assert/strict'
import { pushCors, readPushPayload, validatePushPayload } from '../supabase/functions/send-push-notification/input.js'
import { authorizeCronRequest } from '../supabase/functions/cronAuth.js'

const id = '10000000-0000-0000-0000-000000000001'
test('CORS has no wildcard and permits backend calls without Origin', () => {
  assert.equal(pushCors('https://evil.example'), null)
  assert.equal(pushCors('https://chms1chineselanguageclubsystem.vercel.app')['Access-Control-Allow-Origin'], 'https://chms1chineselanguageclubsystem.vercel.app')
  assert.equal(pushCors(null)['Access-Control-Allow-Origin'], undefined)
  assert.ok(pushCors('https://club.example', 'https://club.example'))
})
test('notification schema limits batches and discards privileged row fields', () => {
  const row = { user_id: id, type: 'announcement', title: 'Title', body: 'Body', id, push_actor_id: id }
  const body = validatePushPayload({ notifications: [row], url: '/#/tasks' })
  assert.equal(body.notifications[0].id, undefined)
  assert.equal(body.notifications[0].push_actor_id, undefined)
  for (const value of [{notification_ids: [3]}, {notification_ids: Array(501).fill(id)}, { notifications: [{...row, body: 'x'.repeat(4001)}] }, {notification_ids:[id], url:'https://evil.example'}, {notification_ids:[id],url:'//evil.example'}, {notification_ids:[id],url:'/\\evil.example'}]) assert.throws(() => validatePushPayload(value))
})
test('body reader rejects invalid JSON, content type and oversized content', async () => {
  const request = body => new Request('https://example.invalid', { method:'POST',headers:{'Content-Type':'application/json'},body })
  assert.equal((await readPushPayload(request(JSON.stringify({notification_ids:[id]})))).notification_ids[0], id)
  await assert.rejects(readPushPayload(request('{')), error => error.status===400)
  await assert.rejects(readPushPayload(new Request('https://example.invalid',{method:'POST',body:'{}'})), error => error.status===400)
  await assert.rejects(readPushPayload(request('x'.repeat(3*1024*1024+1))), error => error.status===413)
})
test('cron guards require POST and an exact server credential', () => {
  const request = (method, headers={}) => new Request('https://example.invalid',{method,headers})
  assert.equal(authorizeCronRequest(request('GET'),'server','cron'),405)
  assert.equal(authorizeCronRequest(request('POST'),'server','cron'),401)
  assert.equal(authorizeCronRequest(request('POST',{authorization:'Bearer public-anon'}),'server','cron'),401)
  assert.equal(authorizeCronRequest(request('POST',{authorization:'Bearer server'}),'server','cron'),200)
  assert.equal(authorizeCronRequest(request('POST',{'x-cron-secret':'cron'}),'server','cron'),200)
  assert.equal(authorizeCronRequest(request('POST'),undefined,undefined),401)
})
