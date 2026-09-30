import test from 'node:test'
import assert from 'node:assert/strict'
import { savedTaskDelivery } from '../src/utils/savedTaskDelivery.js'
import { taskPerformance } from '../src/utils/taskPerformance.js'

test('failed delivery cannot turn a saved task into a failed save', async () => {
  assert.equal(await savedTaskDelivery(async () => { throw new Error('offline') }), false)
  assert.equal(await savedTaskDelivery(async () => ({ push_failed: 1 })), false)
  assert.equal(await savedTaskDelivery(async () => [{ push_failed: 0 }, { push_failed: 1 }]), false)
  assert.equal(await savedTaskDelivery(async () => ({ push_failed: 0 })), true)
})

test('current performance excludes deleted tasks without preserving a snapshot', () => {
  const tasks = [{ status: 'completed' }, { status: 'pending' }]
  assert.equal(taskPerformance(tasks).completionRate, 50)
  assert.equal(taskPerformance(tasks.slice(0, 1)).completionRate, 100)
  assert.equal(taskPerformance(tasks.slice(1)).completionRate, 0)
})
