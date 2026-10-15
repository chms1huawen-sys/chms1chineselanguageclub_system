import { supabase } from '../supabaseClient'
import { createSignedImageCache } from './signedImageCache'
import { displayPhotoPath } from './blogDisplayPhoto'
import { blogMediaUrl } from './blogMediaUrl'

export const signBlogImage = createSignedImageCache(async path => {
  try {
    const endpoint = blogMediaUrl(path)
    if (!endpoint.startsWith('/api/blog-media?')) throw new Error('Not a gateway image')
    const response = await fetch(`${endpoint}&format=json`, { cache: 'no-store' })
    if (response.ok) {
      const result = await response.json()
      if (result.data?.signedUrl) return result
    }
  } catch { /* Local Vite and private studio previews still use authenticated Storage. */ }
  return supabase.storage.from('blog-photos').createSignedUrl(await displayPhotoPath(supabase, path), 300)
}, Date.now, 4 * 60 * 1000)
