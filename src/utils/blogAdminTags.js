export function adminTagIds(post, library) {
  if (Array.isArray(post.tag_ids) && post.tag_ids.length) return post.tag_ids
  const names = Array.isArray(post.tags) ? post.tags : []
  return library.filter(tag => names.includes(tag.name)).map(tag => tag.id)
}

export function adminTagNames(post, library) {
  const selected = library.filter(tag => post.tag_ids?.includes(tag.id)).map(tag => tag.name)
  const unregistered = (Array.isArray(post.tags) ? post.tags : []).filter(name => !library.some(tag => tag.name === name))
  return [...new Set([...selected, ...unregistered])]
}
