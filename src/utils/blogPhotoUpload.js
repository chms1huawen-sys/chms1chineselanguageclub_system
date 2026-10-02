import { createImagePreview } from './imagePreview.js'

export async function uploadBlogPhoto(bucket, file, ownerId, extension, preview = createImagePreview, uuid = () => crypto.randomUUID()) {
  const original = `${ownerId}/${uuid()}.${extension}`
  const uploaded = await bucket.upload(original, file, { contentType: file.type })
  if (uploaded.error) throw uploaded.error
  let path = original
  try {
    const copy = await preview(file)
    if (copy) {
      const display = `${ownerId}/${uuid()}.webp`
      const result = await bucket.upload(display, copy, { contentType: 'image/webp' })
      if (!result.error) path = display
    }
  } catch {
    // A preview failure must not discard a successfully uploaded original.
  }
  return { path, original_path: path === original ? null : original }
}
