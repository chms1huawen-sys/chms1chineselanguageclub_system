export function canModifyTask(task, profile) {
  return Boolean(task?.created_by && profile?.id && task.created_by === profile.id)
}
