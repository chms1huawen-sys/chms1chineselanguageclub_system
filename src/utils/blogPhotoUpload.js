import { createImagePreview } from './imagePreview.js'
import { isDirectR2Photo } from './r2Asset.js'

export async function uploadBlogPhoto(bucket, file, ownerId, extension, preview = createImagePreview, uuid = () => crypto.randomUUID()) {
  let original = `${ownerId}/${uuid()}.${extension}`
  const uploaded = await bucket.upload(original, file, { contentType: file.type })
  if (uploaded.error) throw uploaded.error
  original = uploaded.data?.path || original
  let path = original
  try {
    const copy = await preview(file)
    if (copy || isDirectR2Photo(original)) {
      const displayFile = copy || file
      const displayExtension = copy ? 'webp' : extension
      const display = `${ownerId}/${uuid()}.${displayExtension}`
      const result = await bucket.upload(display, displayFile, { contentType: copy ? 'image/webp' : file.type, cacheControl: '86400' })
      if (!result.error) path = result.data?.path || display
    }
  } catch {
    // A preview failure must not discard a successfully uploaded original.
  }
  if (isDirectR2Photo(original) && path === original) {
    await bucket.remove?.([original])
    throw new Error('Unable to create a public preview. Original photos were not published.')
  }
  return { path, original_path: path === original ? null : original }
}
