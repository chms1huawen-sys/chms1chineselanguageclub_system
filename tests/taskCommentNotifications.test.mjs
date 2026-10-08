import test from 'node:test'
import assert from 'node:assert/strict'
import { taskCommentNotifications } from '../src/utils/taskCommentNotifications.js'

test('comments notify the creator and other assignees, once each, excluding the sender', () => {
  const task = { created_by: 'creator', assigned_to: ['a', 'b', 'a'], title: 'Task' }
  const comment = { id: 'comment', content: 'Update' }
  const rows = taskCommentNotifications(task, comment, { id: 'a', name: 'A' }, 'en')
  assert.deepEqual(rows.map(row => row.user_id), ['creator', 'b'])
  assert.equal(rows[0].dedupe_key, 'task-comment-comment-creator')
  assert.deepEqual(taskCommentNotifications(task, comment, { id: 'creator' }).map(row => row.user_id), ['a', 'b'])
  assert.equal(taskCommentNotifications({ created_by: 'creator' }, comment, { id: 'creator' }).length, 0)
})

test('replies also notify previous commenters, excluding the sender and duplicate participants', () => {
  const task = { created_by: 'creator', assigned_to: ['a'], title: 'Task' }
  const conversation = [{ user_id: 'previous-commenter' }, { user_id: 'previous-commenter' }, { user_id: 'a' }]
  const rows = taskCommentNotifications(task, { id: 'new-comment', content: 'Reply' }, { id: 'a' }, 'zh', conversation)
  assert.deepEqual(rows.map(row => row.user_id), ['creator', 'previous-commenter'])
})
