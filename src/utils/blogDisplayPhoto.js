export async function displayPhotoPath(db, path) {
  try {
    const { data, error } = await db.from('blog_media').select('display_path').eq('path', path).not('display_path', 'is', null).limit(1).maybeSingle()
    return !error && data?.display_path ? data.display_path : path
  } catch {
    return path
  }
}
