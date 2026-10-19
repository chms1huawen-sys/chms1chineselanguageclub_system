export const BLOG_MANAGER_ROLES = ['chairperson', 'convener_teacher', 'advisor_teacher', 'advisor', 'media_lead', 'vice_media_lead', 'social_media_editor']
export const canManageBlog = profile => profile?.is_active === true && BLOG_MANAGER_ROLES.includes(profile.role) && profile.can_manage_blog !== false
