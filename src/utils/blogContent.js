export const sections = [
  { path: '/', type: '', zh: '首页', en: 'Home' },
  { path: '/literature', type: 'article', zh: '文学角落', en: 'Literature' },
  { path: '/activities', type: 'event', zh: '活动记录', en: 'Activities' },
  { path: '/bookroom', type: 'publication', zh: '书坊', en: 'Bookroom' },
  { path: '/news', type: 'notice', zh: '学会资讯', en: 'Club news' },
  { path: '/about', type: '', zh: '关于我们', en: 'About' },
]
export const sectionOf = type => sections.find(section => section.type === type && type) || sections[1]
export const ordered = rows => [...rows].sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name))
export const publicCategories = (rows, type) => ordered(rows.filter(row => row.is_visible !== false && (!type || !row.section || row.section === 'all' || row.section === type) && (!row.parent_id || rows.some(parent => parent.id === row.parent_id && parent.is_visible !== false))))
export const postTags = (post, library) => Array.isArray(post.tag_ids)
  ? ordered(library.filter(tag => post.tag_ids.includes(tag.id) && tag.is_visible !== false))
  : (post.tags || []).map(name => library.find(tag => tag.name === name) || { id: name, name }).filter(tag => tag.is_visible !== false)
export function safePublicLink(value) {
  if (typeof value !== 'string' || !value.trim()) return ''
  if (/^\/(?!\/)[^\\\s]*$/.test(value)) return value
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '' } catch { return '' }
}
export const safeColor = value => /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#28688e'
