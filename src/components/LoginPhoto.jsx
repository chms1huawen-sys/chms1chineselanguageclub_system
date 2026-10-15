import { useEffect, useRef, useState } from 'react'
import { loginPhotoLayout } from '../utils/loginPresentation'
import { blogMediaUrl } from '../utils/blogMediaUrl'

export default function LoginPhoto({ slide, en, className = '' }) {
  const frame = useRef(null)
  const [box, setBox] = useState(null)
  const [failed, setFailed] = useState([])
  const gateway = blogMediaUrl(slide.path, import.meta.env.VITE_SUPABASE_URL)
  const source = !failed.includes(gateway) ? gateway : !failed.includes(slide.path) ? slide.path : '/login-group-2026.jpeg'
  useEffect(() => {
    if (!window.ResizeObserver) return
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])
  const style = source === gateway && loginPhotoLayout(slide.crop, box)
  return <div ref={frame} className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><img src={source} alt={en ? slide.title_en : slide.title} onError={() => setFailed(values => values.includes(source) ? values : [...values, source])} style={style || { width: '100%', height: '100%', objectFit: 'cover' }} /></div>
}
