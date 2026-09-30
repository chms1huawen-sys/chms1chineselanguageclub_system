import { supabase } from '../supabaseClient'
import { createSignedImageCache } from './signedImageCache'

export const signBlogImage = createSignedImageCache(path =>
  supabase.storage.from('blog-photos').createSignedUrl(path, 3600),
)
