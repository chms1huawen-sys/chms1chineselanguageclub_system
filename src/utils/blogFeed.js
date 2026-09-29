import { publicationYear } from './blogPresentation.js'

export const HOME_STORY_COUNT = 6
export const STORY_PAGE_SIZE = 8
export const FEATURED_STORY_COUNT = 6
export const MOMENT_COUNT = 8

export function compareStories(a, b, direction = 'desc', pinned = true) {
  const sticky = pinned ? Number(!!b.is_sticky) - Number(!!a.is_sticky) : 0
  return sticky || (direction === 'asc' ? 1 : -1) * (
    publicationYear(a).localeCompare(publicationYear(b)) ||
    String(a.published_at || '').localeCompare(String(b.published_at || ''))
  ) || String(a.id || a.slug || '').localeCompare(String(b.id || b.slug || ''))
}

export function featuredStories(posts) {
  return posts.filter(post => post.featured).sort((a, b) => compareStories(a, b, 'desc', false)).slice(0, FEATURED_STORY_COUNT)
}
