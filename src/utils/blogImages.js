import { supabase } from '../supabaseClient'
import { createSignedImageCache } from './signedImageCache'
import { displayPhotoPath } from './blogDisplayPhoto'

export const signBlogImage = createSignedImageCache(async path =>
  supabase.storage.from('blog-photos').createSignedUrl(await displayPhotoPath(supabase, path), 3600),
)
