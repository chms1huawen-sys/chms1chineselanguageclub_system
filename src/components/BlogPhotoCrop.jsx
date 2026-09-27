import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop'
import { Crop, X, RotateCcw } from 'lucide-react'
import { supabase } from '../supabaseClient'
import 'react-image-crop/dist/ReactCrop.css'
import './BlogPhotoCrop.css'

export default function BlogPhotoCrop({ path, value, publicAsset = false, onSave, onClose, en }) {
  const dialog = useRef(null)
  const image = useRef(null)
  const [src, setSrc] = useState('')
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [crop, setCrop] = useState(value || { unit: '%', x: 0, y: 0, width: 100, height: 100 })
  const [aspect, setAspect] = useState('free')
  const t = (zh, english) => en ? english : zh
  useEffect(() => {
    let active = true
    async function load() {
      try {
        let url = path
        if (!/^https?:\/\//.test(path) && !/^\/(?!\/)/.test(path)) {
          if (publicAsset) url = supabase.storage.from('blog-site-media').getPublicUrl(path).data.publicUrl
          else { const result = await supabase.storage.from('blog-photos').createSignedUrl(path, 3600); if (result.error) throw result.error; url = result.data.signedUrl }
        }
        if (active) setSrc(url)
      } catch { if (active) setError(t('照片无法载入，请重新打开。', 'Unable to load photo. Please try again.')) }
    }
    load()
    return () => { active = false }
  }, [path, publicAsset, en]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => previous?.focus()
  }, [])
  function ratio(next) {
    setAspect(next)
    const img = image.current
    if (next !== 'free' && img) setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, Number(next), img.width, img.height), img.width, img.height))
  }
  return createPortal(<dialog ref={dialog} className="blog-crop-dialog" aria-labelledby="blog-crop-title" onCancel={event => { event.preventDefault(); onClose() }}>
    <header><h2 id="blog-crop-title"><Crop size={20} />{t('裁切照片', 'Crop photo')}</h2><button type="button" aria-label={t('关闭裁切', 'Close crop')} onClick={onClose}><X size={20} /></button></header>
    <div className="blog-crop-controls"><label>{t('比例', 'Aspect ratio')}<select aria-label={t('比例', 'Aspect ratio')} value={aspect} disabled={!loaded} onChange={e => ratio(e.target.value)}><option value="free">{t('自由裁切', 'Free crop')}</option><option value="1">1:1</option><option value={4 / 3}>4:3</option><option value={16 / 9}>16:9</option><option value={3 / 4}>3:4</option></select></label><button type="button" onClick={() => { setAspect('free'); setCrop({ unit: '%', x: 0, y: 0, width: 100, height: 100 }) }}><RotateCcw size={18} />{t('重置', 'Reset')}</button></div>
    {error && <p role="alert">{error}</p>}
    <div className="blog-crop-stage">{src && <ReactCrop crop={crop} aspect={aspect === 'free' ? undefined : Number(aspect)} onChange={(_, percent) => setCrop(percent)} keepSelection ruleOfThirds><img ref={image} src={src} alt={t('拖动边框裁切照片', 'Drag the frame to crop')} onLoad={() => setLoaded(true)} onError={() => setError(t('照片无法载入。', 'Unable to load photo.'))} /></ReactCrop>}</div>
    <footer><button type="button" onClick={onClose}>{t('取消', 'Cancel')}</button><button type="button" disabled={!loaded || !!error || crop.width < 1 || crop.height < 1} onClick={() => { onSave({ ...crop, naturalWidth: image.current.naturalWidth, naturalHeight: image.current.naturalHeight }); onClose() }}>{t('应用裁切', 'Apply crop')}</button></footer>
  </dialog>, document.body)
}
