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
