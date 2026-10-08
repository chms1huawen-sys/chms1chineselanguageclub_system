export function canSuperviseTasks(profile) {
  return Boolean(profile?.id && profile.is_active !== false &&
    ['chairperson', 'convener_teacher', 'advisor_teacher', 'advisor'].includes(profile.role))
}

export function canModifyTask(task, profile) {
  return Boolean(task?.created_by && profile?.id && profile.is_active !== false &&
    (task.created_by === profile.id || canSuperviseTasks(profile)))
}

export function canDeleteTask(task, profile) {
  return Boolean(task?.created_by && profile?.id && profile.is_active !== false && task.created_by === profile.id)
}

export function canUpdateTaskStatus(task, profile) {
  return canModifyTask(task, profile) || Boolean(profile?.id && profile.is_active !== false && task?.assigned_to?.includes(profile.id))
}
