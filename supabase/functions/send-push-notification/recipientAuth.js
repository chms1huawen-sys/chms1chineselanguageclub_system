import { hasPermission } from '../../../src/utils/permissions.js'
import { canSuperviseTasks } from '../../../src/utils/taskOwnership.js'

const completionRoles = ['convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson']
const boardRoles = ['convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'activity_member', 'media_lead', 'vice_media_lead', 'social_media_editor']
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

export async function authorizeNotificationBatch(client, profile, notifications, ids, now = new Date()) {
  if (!profile?.is_active || notifications.length + ids.length > 500) return false
  const usersResult = await client.from('users').select('id,role,is_active,birthday,can_manage_accounts,can_manage_executive,can_view_leave_records').eq('is_active', true)
  if (usersResult.error) return false
  const users = new Map((usersResult.data || []).map(user => [user.id, user]))
  const sourceCache = new Map()
  async function source(table, id) {
    const key = `${table}:${id}`
    if (!sourceCache.has(key)) {
      const result = await client.from(table).select('*').eq('id', id).maybeSingle()
      sourceCache.set(key, result.error ? null : result.data)
    }
    return sourceCache.get(key)
  }
  for (const row of notifications) {
    const recipient = users.get(row.user_id)
    if (!recipient || typeof row.title !== 'string' || typeof row.body !== 'string' || row.title.length > 300 || row.body.length > 4000) return false
    if (row.type === 'announcement') {
      if (!hasPermission(profile, 'can_manage_announcements')) return false
      const match = row.dedupe_key?.match(new RegExp(`^announcement-(${uuid})-${row.user_id}$`, 'i'))
      const announcement = match && await source('announcements', match[1])
      if (!announcement) return false
      if (announcement.target_type === 'board' && !(hasPermission(recipient, 'can_manage_executive') || boardRoles.includes(recipient.role))) return false
      if (announcement.target_type === 'committee') {
        const result = await client.from('team_members').select('user_id').eq('team_id', announcement.target_team_id).eq('user_id', row.user_id).maybeSingle()
        if (result.error || !result.data) return false
      }
    } else if (row.type === 'task_commented') {
      const match = row.dedupe_key?.match(new RegExp(`^task-comment-(${uuid})-${row.user_id}$`, 'i'))
      const comment = match && await source('task_comments', match[1])
      const task = comment && await source('tasks', comment.task_id)
      if (!task || task.archived_at || comment.user_id !== profile.id || row.user_id === profile.id) return false
      const participants = [task.created_by, ...(task.assigned_to || [])]
      if (!participants.includes(row.user_id) && !canSuperviseTasks(recipient)) return false
      if (!participants.includes(profile.id) && !canSuperviseTasks(profile)) return false
      // Notification copy is derived from the saved comment, never trusted from the browser.
      row.title = `任务有新留言：${task.title}`.slice(0, 300)
      row.body = `${profile.name || '成员'}：${comment.content}`.slice(0, 4000)
    } else if (['task_assigned', 'task_completed', 'task_status_updated'].includes(row.type)) {
      const match = row.dedupe_key?.match(new RegExp(`^task-(?:assigned|completed|status)-(${uuid})-${row.user_id}(?:-\\d+)?$`, 'i'))
      const task = match && await source('tasks', match[1])
      if (!task) return false
      const manages = canSuperviseTasks(profile) || hasPermission(profile, 'can_create_tasks') && task.created_by === profile.id
      if (row.type === 'task_assigned') {
        if (!manages || !task.assigned_to?.includes(row.user_id)) return false
      } else {
        if (!manages && !task.assigned_to?.includes(profile.id)) return false
        if (row.type === 'task_completed') {
          if (task.status !== 'completed' || !(row.user_id === task.created_by || completionRoles.includes(recipient.role) || hasPermission(recipient, 'can_manage_accounts'))) return false
        } else if (row.user_id !== task.created_by) return false
      }
    } else if (row.type === 'leave_application_submitted') {
      const match = row.dedupe_key?.match(new RegExp(`^leave-(${uuid})-${row.user_id}$`, 'i'))
      const leave = match && await source('leave_applications', match[1])
      if (!leave || leave.user_id !== profile.id || !hasPermission(recipient, 'can_view_leave_records')) return false
    } else if (row.type === 'birthday_wish') {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', month: '2-digit', day: '2-digit' }).format(now)
      const birthday = recipient.birthday?.slice(5, 10)
      const match = row.dedupe_key?.match(new RegExp(`^birthday-wish-${row.user_id}-${profile.id}-\\d+$`, 'i'))
      if (!match || !birthday || today !== birthday) return false
    } else return false
  }
  if (ids.length) {
    // These notifications are created inside inventory/finance RPCs, never supplied as free-form text.
    const result = await client.from('notifications').select('id,type,push_actor_id').in('id', ids)
    if (result.error || result.data?.length !== new Set(ids).size) return false
    if (!result.data.every(row => row.push_actor_id === profile.id && ['inventory', 'finance'].includes(row.type))) return false
  }
  return true
}
