import { validPhotoTarget } from './r2Photos.js'
import { r2SitePath } from '../src/utils/r2Asset.js'

export function snapshotPhotoPath(snapshot, bucket, path, projectUrl) {
  if (!validPhotoTarget(bucket, path)) return null
  if (bucket === 'blog-photos') {
    const photo = snapshot.media.find(row => row.path === path || row.display_path === path)
    if (photo) {
      const display = photo.display_path || photo.path
      return validPhotoTarget(bucket, display) ? display : null
    }
    if (snapshot.posts.some(post => post.cover_path === path)) return path
  }
  let match = false
  const prefix = `${new URL(projectUrl).origin}/storage/v1/object/public/blog-site-media/`
  function visit(value) {
    if (typeof value === 'string') {
      if (bucket === 'blog-site-media' && r2SitePath(value) === path) match = true
      if (bucket === 'blog-photos' && value === path) match = true
      if (bucket === 'blog-site-media' && value.startsWith(prefix)) {
        try { if (decodeURIComponent(value.slice(prefix.length)) === path) match = true } catch { /* Ignore invalid paths. */ }
      }
    } else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  visit(snapshot.settings)
  return match ? path : null
}
