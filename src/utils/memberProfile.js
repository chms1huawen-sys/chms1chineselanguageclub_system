import { PERMISSION_FIELDS } from './permissions.js'

// Browser profiles must not include server-only device push tokens.
export const MEMBER_PROFILE_FIELDS = [
  'id', 'name', 'email', 'custom_role_label', 'role', 'birthday',
  'notification_enabled', 'is_active', 'created_at', 'avatar_url', ...PERMISSION_FIELDS,
].join(',')
