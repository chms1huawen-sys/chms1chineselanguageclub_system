export { BLOG_MANAGER_ROLES, canManageBlog } from './blogAccess.js'
export const blogPath = slug => `/blog/${encodeURIComponent(slug)}`
export const blogLogin = (path = window.location.pathname + window.location.search) => path === '/blog-admin' || /^\/blog\/[a-z0-9-]+(?:\?|$)/.test(path)
  ? `/member#/login?return=${encodeURIComponent(safeBlogReturn(path))}` : '/member#/'
export function safeBlogReturn(value) {
  try {
    const url = new URL(value, 'https://club.invalid')
    if (url.origin !== 'https://club.invalid' || url.hash) return '/'
    const article = /^\/blog\/[a-z0-9-]+$/.test(url.pathname)
    if (!article && !['/', '/blog-admin', '/activities', '/literature', '/news', '/bookroom', '/about'].includes(url.pathname)) return '/'
    if (article) url.searchParams.set('member_view', '1')
    return url.pathname + url.search
  } catch { return '/' }
}
export const validDriveLink = value => !value || /^https:\/\/drive\.google\.com\/(?:drive\/folders\/|file\/d\/)[A-Za-z0-9_-]+(?:[/?#].*)?$/.test(value)
export const emptyArticle = () => ({ title: '', slug: `story-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8)}`, summary: '', body: '', category_id: '', event_date: '', location: '', tags: [], cover_path: '', featured: false, status: 'draft', credit: '' })
export const defaultBlogSettings = { title: '一中华文学会', subtitle: '古晋中华第一中学', intro: '记录相聚的时刻，延续华文的温度。', about: '', contact: '', hero_path: '/login-group-2026.jpeg' }
