import { useEffect, useRef, useState } from 'react'
import { loginPhotoLayout } from '../utils/loginPresentation'

export default function LoginPhoto({ slide, en, className = '' }) {
  const frame = useRef(null)
  const [box, setBox] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!window.ResizeObserver) return
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])
  const style = !failed && loginPhotoLayout(slide.crop, box)
  return <div ref={frame} className={className} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}><img src={failed ? '/login-group-2026.jpeg' : slide.path} alt={en ? slide.title_en : slide.title} onError={() => setFailed(true)} style={style || { width: '100%', height: '100%', objectFit: 'cover' }} /></div>
}
