import test from 'node:test'
import assert from 'node:assert/strict'
import { authorizeNotificationBatch } from '../supabase/functions/send-push-notification/recipientAuth.js'

const actor = '10000000-0000-0000-0000-000000000001'
const recipient = '10000000-0000-0000-0000-000000000002'
const other = '10000000-0000-0000-0000-000000000003'
const sourceId = '20000000-0000-0000-0000-000000000001'
const manager = { id: actor, is_active: true, role: 'chairperson' }
const member = { id: actor, is_active: true, role: 'ordinary_member' }
function client(tables) {
  return { from(table) {
    let data = tables[table] || []
    const query = {
      select: () => query,
      eq: (field, value) => { data = data.filter(row => row[field] === value); return query },
      in: (field, values) => { data = data.filter(row => values.includes(row[field])); return query },
      maybeSingle: async () => ({ data: data[0] || null }),
      then: (resolve, reject) => Promise.resolve({ data }).then(resolve, reject),
    }
    return query
  } }
}
const users = [manager, { id: recipient, is_active: true, role: 'ordinary_member', birthday: '2008-10-01' }, { id: other, is_active: true, role: 'secretary' }]
const row = (type, prefix, user = recipient) => ({ user_id: user, type, title: 'Title', body: 'Body', dedupe_key: `${prefix}-${sourceId}-${user}` })

test('task dispatch requires a real task, authorized actor and assigned recipient', async () => {
  const db = client({ users, tasks: [{ id: sourceId, created_by: actor, assigned_to: [recipient], status: 'pending' }] })
  assert.equal(await authorizeNotificationBatch(db, manager, [row('task_assigned', 'task-assigned')], []), true)
  assert.equal(await authorizeNotificationBatch(db, member, [row('task_assigned', 'task-assigned')], []), false)
  assert.equal(await authorizeNotificationBatch(db, manager, [row('task_assigned', 'task-assigned', other)], []), false)
  assert.equal(await authorizeNotificationBatch(db, manager, [{ ...row('task_completed', 'task-completed', actor) }], []), false)
  assert.equal(await authorizeNotificationBatch(client({ users }), manager, [row('task_assigned', 'task-assigned')], []), false)
})

test('announcement audience cannot be expanded beyond its saved target', async () => {
  const db = client({ users, announcements: [{ id: sourceId, target_type: 'committee', target_team_id: sourceId }], team_members: [{ team_id: sourceId, user_id: recipient }] })
  assert.equal(await authorizeNotificationBatch(db, manager, [row('announcement', 'announcement')], []), true)
  assert.equal(await authorizeNotificationBatch(db, manager, [row('announcement', 'announcement', other)], []), false)
  assert.equal(await authorizeNotificationBatch(db, member, [row('announcement', 'announcement')], []), false)
})

test('leave notifications belong to the applicant and go only to leave reviewers', async () => {
  const db = client({ users, leave_applications: [{ id: sourceId, user_id: actor }] })
  assert.equal(await authorizeNotificationBatch(db, member, [row('leave_application_submitted', 'leave', other)], []), true)
  assert.equal(await authorizeNotificationBatch(db, member, [row('leave_application_submitted', 'leave')], []), false)
  assert.equal(await authorizeNotificationBatch(db, { ...member, id: recipient }, [row('leave_application_submitted', 'leave', other)], []), false)
})

test('notification IDs require business RPC provenance, including an all-or-nothing batch', async () => {
  const db = client({ users, notifications: [{ id: sourceId, type: 'inventory', push_actor_id: actor }] })
  assert.equal(await authorizeNotificationBatch(db, member, [], [sourceId]), true)
  assert.equal(await authorizeNotificationBatch(db, { ...member, id: other }, [], [sourceId]), false)
  assert.equal(await authorizeNotificationBatch(db, member, [], [sourceId, 'missing']), false)
  assert.equal(await authorizeNotificationBatch(client({ users, notifications: [{ id: sourceId, type: 'inventory' }] }), member, [], [sourceId]), false)
})

test('birthday wishes validate the recipient birthday and caller in Malaysian time', async () => {
  const db = client({ users })
  const wish = { user_id: recipient, type: 'birthday_wish', title: 'Happy birthday', body: 'Best wishes', dedupe_key: `birthday-wish-${recipient}-${actor}-1` }
  assert.equal(await authorizeNotificationBatch(db, member, [wish], [], new Date('2026-09-30T16:01:00Z')), true)
  assert.equal(await authorizeNotificationBatch(db, member, [wish], [], new Date('2026-09-30T15:59:00Z')), false)
  assert.equal(await authorizeNotificationBatch(db, member, [{ ...wish, type: 'unknown' }], []), false)
})
