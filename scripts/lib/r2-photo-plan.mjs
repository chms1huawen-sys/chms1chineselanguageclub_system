const imagePath = (value, bucket = 'blog-photos') => typeof value === 'string' &&
  (bucket === 'blog-site-media' ? /^[a-zA-Z0-9_./-]+\.(?:jpe?g|png|webp|avif)$/i : /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_./-]+\.(?:jpe?g|png|webp|avif)$/i).test(value) &&
  !value.split('/').some(part => !part || part === '.' || part === '..')

export function photoCandidates({ posts, albums, media, settings, projectUrl }) {
  const candidates = new Map()
  const publishedPosts = new Set(posts.filter(row => row.status === 'published').map(row => row.id))
  const publishedAlbums = new Set(albums.filter(row => row.status === 'published').map(row => row.id))
  const displays = new Map()
  const add = (bucket, path) => {
    if (!imagePath(path, bucket)) return
    candidates.set(`${bucket}/${path}`, { bucket, path, targetKey: `photos-v1/${bucket}/${path}` })
  }
  let optimizedPhotos = 0
  for (const row of media) {
    if (!publishedPosts.has(row.post_id) && !publishedAlbums.has(row.album_id)) continue
    // Original download files stay in Supabase; only display copies are candidates.
    const display = imagePath(row.display_path) ? row.display_path : row.path
    displays.set(row.path, display)
    add('blog-photos', display)
    if (display !== row.path) optimizedPhotos++
  }
  const sitePrefix = `${new URL(projectUrl).origin}/storage/v1/object/public/blog-site-media/`
  const visit = value => {
    if (typeof value === 'string' && value.startsWith(sitePrefix)) {
      try { add('blog-site-media', decodeURIComponent(value.slice(sitePrefix.length))) } catch { /* Invalid URL is not migrated. */ }
    } else if (Array.isArray(value)) value.forEach(visit)
    else if (value && typeof value === 'object') Object.values(value).forEach(visit)
  }
  for (const row of [...posts, ...albums]) {
    if (row.status !== 'published') continue
    add('blog-photos', displays.get(row.cover_path) || row.cover_path)
    visit(row.cover_path)
  }
  visit(settings)
  return { candidates: [...candidates.values()].sort((a, b) => a.targetKey.localeCompare(b.targetKey)), optimizedPhotos }
}

export function buildPhotoPlan(input, objects, now = new Date()) {
  const { candidates, optimizedPhotos } = photoCandidates(input)
  const byPath = new Map(objects.map(row => [`${row.bucket}/${row.path}`, row]))
  const blocked = []
  const files = []
  for (const candidate of candidates) {
    const object = byPath.get(`${candidate.bucket}/${candidate.path}`)
    const bytes = Number(object?.metadata?.size)
    const contentType = object?.metadata?.mimetype
    if (!object || !Number.isSafeInteger(bytes) || bytes <= 0 || !/^image\/(jpeg|png|webp|avif)$/i.test(contentType || '')) {
      blocked.push({ ...candidate, reason: 'Missing object, size, or supported image MIME type' })
    } else files.push({ ...candidate, bytes, contentType })
  }
  return {
    schemaVersion: 1, generatedAt: now.toISOString(), mode: 'metadata-only',
    totals: { files: files.length, bytes: files.reduce((sum, row) => sum + row.bytes, 0), optimizedPhotos, blocked: blocked.length },
    files, blocked,
  }
}
