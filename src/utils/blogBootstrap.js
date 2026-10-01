// Only public settings are embedded. Never include profiles, sessions or member links.
export function publicBlogSettings(site) {
  return Object.fromEntries(['title', 'subtitle', 'intro', 'about', 'contact', 'hero_path', 'content'].map(key => [key, site[key]]))
}

export function readBlogBootstrap() {
  if (typeof document === 'undefined') return null
  try {
    const site = JSON.parse(document.getElementById('blog-site-settings')?.textContent || 'null')
    return site && typeof site.title === 'string' ? publicBlogSettings(site) : null
  } catch { return null }
}

export function publicBlogArticle(post, media = [], links = []) {
  if (!post || post.status !== 'published') return null
  const fields = ['id', 'slug', 'title', 'summary', 'author', 'body', 'body_document', 'cover_path', 'credit', 'published_at', 'event_date', 'location', 'content_type', 'book_details', 'behind_scenes', 'video_url', 'tags', 'tag_ids', 'category_id', 'event_id', 'related_ids', 'status']
  return {
    post: Object.fromEntries(fields.map(key => [key, post[key]])),
    media: media.map(photo => Object.fromEntries(['id', 'path', 'caption', 'crop', 'width_percent'].map(key => [key, photo[key]]))),
    links: links.filter(link => link.visibility === 'public').map(link => ({ label: link.label, url: link.url, type: link.type, visibility: 'public' })),
  }
}

export function readBlogArticleBootstrap(slug) {
  if (!slug || typeof document === 'undefined') return null
  try {
    const payload = JSON.parse(document.getElementById('blog-article-data')?.textContent || 'null')
    return payload?.post?.slug === slug ? publicBlogArticle(payload.post, payload.media, payload.links) : null
  } catch { return null }
}
