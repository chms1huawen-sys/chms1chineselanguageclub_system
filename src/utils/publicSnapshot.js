import { publicBlogArticle, publicBlogSettings } from './blogBootstrap.js'
import { MOMENT_COUNT } from './blogFeed.js'

const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]))
const settingsKeys = ['site_name', 'about_image', 'about_image_crop', 'about_notes', 'about_title', 'about_board_title', 'latest_title', 'featured_title', 'albums_title', 'submission_note', 'submission_note_en', 'hero_title', 'hero_subtitle', 'hero_cta', 'hero_link', 'hero_fit', 'hero_position', 'hero_tone', 'hero_default_enabled', 'hero_interval', 'hero_path_crop', 'hero_mobile_crop', 'stats_posts_label', 'stats_members_label', 'stats_years_label', 'stats_members', 'stats_start_year', 'stats_end_year']
const cropKeys = ['unit', 'x', 'y', 'width', 'height', 'naturalWidth', 'naturalHeight']
const crop = value => value ? pick(value, cropKeys) : null
const social = rows => (Array.isArray(rows) ? rows : []).map(row => pick(row, ['label', 'url', 'platform', 'enabled']))
const postExtra = ['content_year', 'updated_at', 'featured', 'is_sticky', 'show_in_moments']
const bookKeys = ['author', 'author_bio', 'price', 'published_on', 'pages', 'isbn', 'purchase_label']

export function makePublicSnapshot(input, now = Date.now()) {
  const posts = input.posts.filter(row => row.status === 'published' && !row.deleted_at).map(row => {
    const post = { ...publicBlogArticle(row).post, ...pick(row, postExtra) }
    if (post.book_details) post.book_details = { ...pick(post.book_details, bookKeys), purchase_links: social(post.book_details.purchase_links) }
    return post
  })
  const ids = new Set(posts.map(post => post.id))
  const content = input.settings.content || {}
  const publicContent = { ...pick(content, settingsKeys), social_links: social(content.social_links) }
  publicContent.hero_slides = (Array.isArray(content.hero_slides) ? content.hero_slides : []).map(row => ({ ...pick(row, ['path', 'title', 'subtitle', 'title_en', 'subtitle_en', 'cta', 'link', 'enabled', 'position', 'tone', 'fit']), crop: crop(row.crop), mobile_crop: crop(row.mobile_crop) }))
  if (content.sections) publicContent.sections = pick(content.sections, settingsKeys)
  for (const key of ['about_image_crop', 'hero_path_crop', 'hero_mobile_crop']) if (content[key]) publicContent[key] = crop(content[key])
  const media = input.media.filter(row => ids.has(row.post_id)).map(row => ({ ...pick(row, ['id', 'post_id', 'path', 'display_path', 'caption', 'width_percent', 'position']), crop: crop(row.crop) }))
  const links = input.links.filter(row => ids.has(row.post_id) && row.visibility === 'public').map(row => pick(row, ['post_id', 'label', 'url', 'type', 'visibility', 'position']))
  return {
    schemaVersion: 1, generatedAt: new Date(now).toISOString(), checkedAt: new Date(now).toISOString(),
    settings: publicBlogSettings({ ...input.settings, content: publicContent }), posts, media, links,
    categories: input.categories.map(row => pick(row, ['id', 'name', 'name_en', 'parent_id', 'section', 'position', 'is_visible', 'icon', 'color'])),
    tags: input.tags.map(row => pick(row, ['id', 'name', 'name_en', 'group_name', 'position', 'is_visible', 'icon', 'color'])),
  }
}

export function validPublicSnapshot(value) {
  if (!value || value.schemaVersion !== 1 || !Number.isFinite(Date.parse(value.generatedAt)) || !Number.isFinite(Date.parse(value.checkedAt)) || !value.settings?.title) return false
  if (!['posts', 'media', 'links', 'categories', 'tags'].every(key => Array.isArray(value[key]))) return false
  const ids = new Set(value.posts.map(row => row.id))
  return value.posts.every(row => row.status === 'published' && typeof row.slug === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(row.slug)) &&
    value.media.every(row => ids.has(row.post_id) && !row.original_path) && value.links.every(row => ids.has(row.post_id) && row.visibility === 'public')
}

export function snapshotArticle(snapshot, slug) {
  const post = snapshot.posts.find(row => row.slug === slug)
  return post ? { post, media: snapshot.media.filter(row => row.post_id === post.id).sort((a, b) => (a.position || 0) - (b.position || 0)), links: snapshot.links.filter(row => row.post_id === post.id).sort((a, b) => (a.position || 0) - (b.position || 0)) } : null
}

export function snapshotMoments(snapshot) {
  return snapshot.posts.filter(row => row.content_type === 'event' && row.show_in_moments !== false).slice(0, MOMENT_COUNT).map(post => {
    const first = snapshot.media.filter(row => row.post_id === post.id).sort((a, b) => (a.position || 0) - (b.position || 0))[0]
    return { ...post, moment_path: first?.path || post.cover_path }
  }).filter(row => row.moment_path)
}
