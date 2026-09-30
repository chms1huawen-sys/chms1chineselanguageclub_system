import test from 'node:test'
import assert from 'node:assert/strict'
import { announcementDelivery } from '../src/utils/announcementDelivery.js'

test('partial push failure is not reported as full delivery', async () => {
  const result = await announcementDelivery(async () => ({ push_sent: 2, push_failed: 1, push_skipped: 3 }))
  assert.equal(result.type, 'error')
  assert.match(result.message, /失败 1 次/)
  assert.match(result.message, /跳过 3 位/)
})

test('notification failure preserves the saved announcement outcome', async () => {
  let sends = 0
  const result = await announcementDelivery(async () => { sends++; throw new Error('Offline') })
  assert.equal(sends, 1)
  assert.equal(result.type, 'error')
  assert.match(result.message, /公告已保存/)
  assert.match(result.message, /请勿重复发布/)
})

test('acceptance does not claim phone receipt', async () => {
  const result = await announcementDelivery(async () => ({ push_sent: 5 }), 'en')
  assert.equal(result.type, 'success')
  assert.match(result.message, /does not confirm display/)
})

test('editing explicitly communicates no repeat push', async () => {
  const result = await announcementDelivery(async () => ({ notifications: 5 }), 'zh', true)
  assert.match(result.message, /不会再次推送/)
})
