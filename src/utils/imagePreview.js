export function previewDimensions(width, height, maxEdge = 1920) {
  if (!(width > 0 && height > 0 && maxEdge > 0)) throw new Error('Invalid image dimensions.')
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

// The caller keeps the original upload. Only the display copy is re-encoded.
export async function createImagePreview(file) {
  const bitmap = await createImageBitmap(file)
  try {
    const size = previewDimensions(bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Image preview is not supported.')
    context.drawImage(bitmap, 0, 0, size.width, size.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.85))
    return blob?.type === 'image/webp' && blob.size < file.size ? blob : null
  } finally {
    bitmap.close()
  }
}
