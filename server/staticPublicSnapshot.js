import { photoCandidates } from '../scripts/lib/r2-photo-plan.mjs'
import { snapshotPhotoPath } from './snapshotPhotos.js'

export function staticPublicSnapshot(snapshot, projectUrl) {
  const { candidates } = photoCandidates({ posts: snapshot.posts, albums: [], media: snapshot.media, settings: snapshot.settings, projectUrl })
  const paths = new Map(candidates.map(file => [`${file.bucket}/${file.path}`, `/public-media/${file.bucket}/${file.path}`]))
  function transform(value) {
    if (typeof value === 'string') {
      const display = snapshotPhotoPath(snapshot, 'blog-photos', value, projectUrl)
      if (display && paths.has(`blog-photos/${display}`)) return paths.get(`blog-photos/${display}`)
      const prefix = `${new URL(projectUrl).origin}/storage/v1/object/public/blog-site-media/`
      if (value.startsWith(prefix)) {
        try { return paths.get(`blog-site-media/${decodeURIComponent(value.slice(prefix.length))}`) || value } catch { return value }
      }
      return value
    }
    if (Array.isArray(value)) return value.map(transform)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, transform(item)]))
    return value
  }
  return { snapshot: transform(snapshot), candidates }
}
