import assert from 'node:assert/strict'
import { taskPerformance } from '../src/utils/taskPerformance.js'
const now = Date.parse('2026-09-24T08:00:00Z')
const future = { status: 'pending', due_date: '2026-09-25T08:00:00Z' }
assert.equal(taskPerformance([future, future, future], now).assessment, 'open')
assert.equal(taskPerformance([{ status: 'completed' }], now).assessment, 'unknown')
assert.equal(taskPerformance([{ status: 'completed' }], now).onTimeRate, null)
const late = { status: 'completed', due_date: '2026-09-21T08:00:00Z', completed_at: '2026-09-22T08:00:00Z' }
assert.equal(taskPerformance([late], now).completedLate, 1)
assert.equal(taskPerformance([late], now).assessment, 'late')
assert.equal(taskPerformance([{ ...late, completed_at: late.due_date }], now).onTimeRate, 100)
assert.equal(taskPerformance([{ ...late, status: 'pending' }], now).activeOverdue, 1)
assert.equal(taskPerformance([{ ...future, status: 'need_help' }], now).assessment, 'help')
assert.equal(taskPerformance([{ ...late, completed_at: 'bad' }], now).unknownTiming, 1)
assert.equal(taskPerformance([], now).assessment, 'none')
console.log('Task assessment: future tasks, missing timestamps, late/on-time, overdue and help passed.')
