export function createSignedImageCache(sign, now = Date.now) {
  const entries = new Map()
  return path => {
    const cached = entries.get(path)
    if (cached && cached.expires > now()) return cached.promise
    const entry = { expires: now() + 50 * 60 * 1000 }
    entry.promise = Promise.resolve().then(() => sign(path)).then(result => {
      if (result.error || !result.data?.signedUrl) throw result.error || new Error('Image URL unavailable')
      return result
    }).catch(error => {
      if (entries.get(path) === entry) entries.delete(path)
      throw error
    })
    if (entries.size >= 300) entries.delete(entries.keys().next().value)
    entries.set(path, entry)
    return entry.promise
  }
}
