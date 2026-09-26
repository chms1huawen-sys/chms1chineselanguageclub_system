export const BLOG_MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'media_lead', 'vice_media_lead', 'social_media_editor']
export const canManageBlog = profile => profile?.is_active === true && (profile.can_manage_blog ?? BLOG_MANAGER_ROLES.includes(profile.role))
export const blogPath = slug => `/blog/${encodeURIComponent(slug)}`
export const blogLogin = (path = window.location.pathname + window.location.search) => `/#/login?return=${encodeURIComponent(path)}`
export function safeBlogReturn(value) {
  try {
    const url = new URL(value, 'https://club.invalid')
    return url.origin === 'https://club.invalid' && (['/', '/blog-admin', '/activities', '/bookroom', '/about'].includes(url.pathname) || /^\/blog\/[a-z0-9-]+$/.test(url.pathname)) ? url.pathname + url.search : '/'
  } catch { return '/' }
}
export const validDriveLink = value => !value || /^https:\/\/drive\.google\.com\/(?:drive\/folders\/|file\/d\/)[A-Za-z0-9_-]+(?:[/?#].*)?$/.test(value)
export const emptyArticle = () => ({ title: '', slug: `story-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8)}`, summary: '', body: '', category_id: '', event_date: '', location: '', tags: [], cover_path: '', featured: false, status: 'draft', credit: '' })
export const defaultBlogSettings = { title: '一中华文学会', subtitle: '古晋中华第一中学', intro: '记录相聚的时刻，延续华文的温度。', about: '', contact: '', hero_path: '/login-group-2026.jpeg' }
