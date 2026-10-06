export function publicPageRequest(query = {}) {
  const scalar = (key, maximum, fallback = '') => {
    const value = query[key]
    if (value === undefined) return fallback
    if (typeof value !== 'string' || value.length > maximum || Array.from(value).some(character => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })) {
      throw new TypeError('Invalid public page request')
    }
    return value
  }
  const slug = scalar('slug', 200)
  const rawView = scalar('view', 20, 'home')
  const view = rawView === 'blog' ? 'home' : rawView
  const q = scalar('q', 200).trim()
  return { slug, view, search: !slug && view === 'home' ? q : '' }
}
