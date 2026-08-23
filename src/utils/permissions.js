const ACCOUNT_MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson']
const EXECUTIVE_VIEW_ROLES = [
  'convener_teacher',
  'advisor_teacher',
  'advisor',
  'chairperson',
  'vice_chairperson',
  'secretary',
  'vice_secretary',
  'treasurer',
  'vice_treasurer',
  'general_affairs',
  'vice_general_affairs',
  'activity_lead',
  'vice_activity_lead',
  'activity_member',
  'media_lead',
  'vice_media_lead',
  'social_media_editor',
  'custom',
]
const TASK_CREATOR_ROLES = [
  ...ACCOUNT_MANAGER_ROLES,
  'secretary',
  'vice_secretary',
  'treasurer',
  'vice_treasurer',
  'general_affairs',
  'vice_general_affairs',
  'activity_lead',
  'vice_activity_lead',
  'media_lead',
  'vice_media_lead',
  'social_media_editor',
]
const ANNOUNCEMENT_MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson']
const CALENDAR_MANAGER_ROLES = [...ACCOUNT_MANAGER_ROLES, 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer']
const LEAVE_VIEWER_ROLES = ['convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'secretary', 'vice_secretary']

export const PERMISSION_FIELDS = [
  'can_manage_accounts',
  'can_manage_executive',
  'can_create_tasks',
  'can_manage_announcements',
  'can_manage_calendar',
  'can_view_leave_records',
  'can_manage_handover',
]

export const hasPermission = (profile, permission) => {
  if (!profile) return false
  if (profile[permission] === true) return true

  const role = profile.role
  if (permission === 'can_manage_accounts') return ACCOUNT_MANAGER_ROLES.includes(role)
  if (permission === 'can_manage_executive') return ACCOUNT_MANAGER_ROLES.includes(role)
  if (permission === 'can_create_tasks') return TASK_CREATOR_ROLES.includes(role)
  if (permission === 'can_manage_announcements') return ANNOUNCEMENT_MANAGER_ROLES.includes(role)
  if (permission === 'can_manage_calendar') return CALENDAR_MANAGER_ROLES.includes(role)
  if (permission === 'can_view_leave_records') return LEAVE_VIEWER_ROLES.includes(role)
  if (permission === 'can_manage_handover') return ACCOUNT_MANAGER_ROLES.includes(role)
  return false
}

export const canViewExecutiveManagement = (profile) => {
  if (!profile) return false
  return EXECUTIVE_VIEW_ROLES.includes(profile.role) || hasPermission(profile, 'can_manage_executive')
}

export const canViewLeaveRecords = (profile) => {
  return hasPermission(profile, 'can_view_leave_records')
}

export const canViewTaskPerformance = (profile) => {
  return ACCOUNT_MANAGER_ROLES.includes(profile?.role) || hasPermission(profile, 'can_manage_accounts')
}
