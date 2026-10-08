import { canSuperviseTasks } from './taskOwnership.js'

export function taskCommentNotifications(task, comment, actor, lang = 'zh', users = []) {
  const recipients = [...new Set([task.created_by, ...(task.assigned_to || []), ...users.filter(canSuperviseTasks).map(user => user.id)])]
    .filter(id => id && id !== actor.id)
  return recipients.map(userId => ({
    user_id: userId,
    type: 'task_commented',
    title: (lang === 'zh' ? '任务有新留言：' : 'New comment on: ') + task.title,
    body: `${actor.name || (lang === 'zh' ? '成员' : 'Member')}：${comment.content}`.slice(0, 4000),
    dedupe_key: `task-comment-${comment.id}-${userId}`,
  }))
}
