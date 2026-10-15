export function blogMediaUrl(path, projectUrl, bucket = 'blog-photos') {
  if (typeof path !== 'string' || !path) return ''
  if (/^https?:\/\//i.test(path)) {
    try {
      const url = new URL(path)
      const prefix = '/storage/v1/object/public/blog-site-media/'
      if (!projectUrl || url.origin !== new URL(projectUrl).origin || !url.pathname.startsWith(prefix) || url.search || url.hash) return path
      path = decodeURIComponent(url.pathname.slice(prefix.length))
      bucket = 'blog-site-media'
    } catch { return path }
  }
  if (!['blog-photos', 'blog-site-media'].includes(bucket) || !/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_./-]+\.(?:jpe?g|png|webp|avif)$/i.test(path) ||
      path.length > 500 || path.split('/').some(part => !part || part === '.' || part === '..')) return path
  return `/api/blog-media?bucket=${bucket}&path=${encodeURIComponent(path)}`
}
