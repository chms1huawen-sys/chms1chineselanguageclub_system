import test from 'node:test'
import assert from 'node:assert/strict'
import { weeklyTaskPreview } from '../src/utils/taskSchedule.js'
import { publicNavigationTarget } from '../src/utils/publicNavigation.js'
test('weekly dates use Malaysia time, including same-day and week rollover', () => {
  const rows=weeklyTaskPreview({first:'2026-10-01T19:00',weekday:'4',time:'20:00',count:2})
  assert.equal(rows[0].publish,'2026-10-01T11:00:00.000Z')
  assert.equal(rows[0].due,'2026-10-01T12:00:00.000Z')
  assert.equal(rows[1].publish,'2026-10-08T11:00:00.000Z')
  assert.equal(weeklyTaskPreview({first:'2026-10-01T19:00',weekday:'4',time:'18:00',count:1})[0].due,'2026-10-08T10:00:00.000Z')
  assert.deepEqual(weeklyTaskPreview({first:'bad',weekday:4,time:'19:00',count:4}),[])
})
test('only public same-origin routes use soft navigation', () => {
  assert.equal(publicNavigationTarget('/blog/story-2026-abc','https://example.com'),'/blog/story-2026-abc')
  for(const path of ['/blog-admin','/#/members','https://evil.test/blog/story','/api/blog']) assert.equal(publicNavigationTarget(path,'https://example.com'),null)
  assert.equal(publicNavigationTarget('/?q=poem','https://example.com'),'/?q=poem')
})
