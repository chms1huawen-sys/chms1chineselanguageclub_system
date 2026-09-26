import { useEffect, useState } from 'react'
import { Upload, Image, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../supabaseClient'

async function checked(query) {
  const result = await query
  if (result.error) throw result.error
  return result.data
}

export function StudioImage({ path, alt = '', publicAsset = false }) {
  const [image, setImage] = useState(null)
  useEffect(() => {
    let active = true
    if (!path) return
    if (/^https?:\/\//.test(path) || /^\/(?!\/)/.test(path)) {
      Promise.resolve().then(() => { if (active) setImage({ path, url: path }) })
    } else if (publicAsset) {
      const { data } = supabase.storage.from('blog-site-media').getPublicUrl(path)
      Promise.resolve().then(() => { if (active) setImage({ path, url: data.publicUrl }) })
    } else {
      supabase.storage.from('blog-photos').createSignedUrl(path, 3600).then(({ data }) => {
        if (active) setImage({ path, url: data?.signedUrl })
      })
    }
    return () => { active = false }
  }, [path, publicAsset])
  return image?.path === path && image.url ? <img src={image.url} alt={alt} loading="lazy" /> : <span role="img" aria-label={alt}><Image size={28} /></span>
}

export default function StudioMedia({ owner, kind, media, setMedia, changeCover, savedCover, disabled, run, setDirty, en }) {
  const t = (zh, english) => en ? english : zh
  const field = kind === 'album' ? 'album_id' : 'post_id'
  const limit = 300
  async function upload(files) {
    await run(async () => {
      if (files.length + media.length > limit) throw new Error(t(`最多 ${limit} 张照片。`, `Maximum ${limit} photos.`))
      const types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
      if (files.some(file => !types[file.type] || file.size > 10 * 1024 * 1024)) throw new Error(t('只支持 JPG、PNG、WEBP，每张最多 10MB。', 'Use JPG, PNG or WEBP, up to 10MB each.'))
      for (const file of files) {
        const path = `${owner.id}/${crypto.randomUUID()}.${types[file.type]}`
        await checked(supabase.storage.from('blog-photos').upload(path, file, { contentType: file.type }))
        let row
        try {
          row = await checked(supabase.from('blog_media').insert({ [field]: owner.id, path, caption: '', position: media.length + files.indexOf(file) }).select().single())
        } catch (error) {
          await supabase.storage.from('blog-photos').remove([path])
          throw error
        }
        setMedia(items => [...items, row])
      }
    }, t('照片已上传。', 'Photos uploaded.'))
  }
  function move(index, delta) {
    const next = [...media]
    ;[next[index], next[index + delta]] = [next[index + delta], next[index]]
    setMedia(next); setDirty(true)
  }
  return <section className="bs-section"><div className="bs-section-heading"><h3>{t('照片', 'Photos')} ({media.length}/{limit})</h3><label><Upload size={16} />{t('上传照片', 'Upload photos')}<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={disabled || !owner.id} onChange={e => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) upload(files) }} /></label></div>
    {!owner.id && <p>{t('请先保存内容，再上传照片。', 'Save the record before uploading photos.')}</p>}
    {owner.cover_path && <button type="button" disabled={disabled} onClick={() => changeCover('')}>{t('清除封面', 'Clear cover')}</button>}
    <div className="bs-media-grid">{media.map((item, index) => <figure key={item.id}><StudioImage path={item.path} alt={item.caption} /><label>{t('照片说明', 'Caption')}<input disabled={disabled} value={item.caption || ''} onChange={e => { setMedia(items => items.map(m => m.id === item.id ? { ...m, caption: e.target.value } : m)); setDirty(true) }} /></label><div className="bs-actions">
      <button type="button" disabled={disabled} aria-pressed={owner.cover_path === item.path} onClick={() => changeCover(item.path)}>{t('设为封面', 'Set cover')}</button>
      <button type="button" title={t('前移', 'Move up')} disabled={disabled || !index} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" title={t('后移', 'Move down')} disabled={disabled || index === media.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button>
      <button type="button" title={t('删除照片', 'Delete photo')} disabled={disabled || item.path === savedCover || item.path === owner.cover_path} onClick={() => { if (window.confirm(t('永久删除这张照片？', 'Permanently delete this photo?'))) run(async () => { await checked(supabase.from('blog_media').delete().eq('id', item.id).eq(field, owner.id)); setMedia(items => items.filter(m => m.id !== item.id)); await checked(supabase.storage.from('blog-photos').remove([item.path])) }) }}><Trash2 size={16} /></button>
    </div></figure>)}</div>
  </section>
}
