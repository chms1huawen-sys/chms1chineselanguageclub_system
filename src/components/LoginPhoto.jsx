import { useEffect, useRef, useState } from 'react'
import { loginPhotoLayout } from '../utils/loginPresentation'
import { blogMediaUrl } from '../utils/blogMediaUrl'
import { r2SitePath } from '../utils/r2Asset.js'
import { privateR2Image } from '../utils/blogData'

export default function LoginPhoto({ slide, en, editor = false, className = '' }) {
  const frame = useRef(null)
  const [box, setBox] = useState(null)
  const [failed, setFailed] = useState([])
  const [privateImage, setPrivateImage] = useState(null)
  useEffect(() => {
    const path = editor && r2SitePath(slide.path)
    if (!path) return
    let active=true, url
    privateR2Image('blog-site-media',path).then(({data})=>{url=data.signedUrl;if(active)setPrivateImage({path:slide.path,url});else URL.revokeObjectURL(url)}).catch(()=>{})
    return ()=>{active=false;if(url)URL.revokeObjectURL(url)}
  },[editor,slide.path])
  const gateway = blogMediaUrl(slide.path, import.meta.env.VITE_SUPABASE_URL)
  const source = privateImage?.path===slide.path ? privateImage.url : !failed.includes(gateway) ? gateway : !failed.includes(slide.path) ? slide.path : '/login-group-2026.jpeg'
  useEffect(() => {
    if (!window.ResizeObserver) return
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])
  const style = (privateImage?.path===slide.path || source === gateway || source === slide.path) && loginPhotoLayout(slide.crop, box)
  return <div ref={frame} className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><img src={source} alt={en ? slide.title_en : slide.title} onError={() => setFailed(values => values.includes(source) ? values : [...values, source])} style={style || { width: '100%', height: '100%', objectFit: 'cover' }} /></div>
}
