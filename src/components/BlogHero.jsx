import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { safePublicLink } from '../utils/blogContent'
import { heroSlides, heroImageLayout } from '../utils/blogPresentation'

function HeroPhoto({ Image, slide, priority, siteTitle }) {
  const frame = useRef(null)
  const [dimensions, setDimensions] = useState(null)
  const [box, setBox] = useState(null)
  const [mobile, setMobile] = useState(() => matchMedia('(max-width:700px)').matches)
  useEffect(() => {
    const query = matchMedia('(max-width:700px)')
    const change = () => setMobile(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  const crop = mobile && slide.mobile_crop ? slide.mobile_crop : slide.crop
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(frame.current)
    return () => observer.disconnect()
  }, [])
  const layout = dimensions && box ? heroImageLayout(dimensions.width, dimensions.height, box.width, box.height, 'cover') : null
  return <a ref={frame} className="blog-showcase-photo" data-layout={layout?.mode || 'cover'} href={safePublicLink(slide.link) || '/activities'} aria-label={slide.title || siteTitle}>
    <Image key={JSON.stringify(crop)} path={slide.path} crop={crop} alt={slide.title || siteTitle} fetchPriority={priority ? 'high' : 'auto'}
      onLoad={event => setDimensions({ width: event.currentTarget.naturalWidth * (crop?.width || 100) / 100, height: event.currentTarget.naturalHeight * (crop?.height || 100) / 100 })}
      style={layout ? { width: layout.width, height: layout.height, maxWidth: 'none', maxHeight: 'none' } : undefined} />
  </a>
}

export default function BlogHero({ site, Image, en }) {
  const slides = heroSlides(site)
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const active = index % slides.length
  const interval = Math.max(3, Math.min(60, Number(site.content?.hero_interval) || 7)) * 1000
  const t = (zh, english) => en ? english : zh
  useEffect(() => {
    if (hovered || slides.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => { if (!document.hidden) setIndex(i => (i + 1) % slides.length) }, interval)
    return () => clearInterval(timer)
  }, [hovered, slides.length, interval, index])
  return <section className="blog-showcase" aria-label={t('学会故事', 'Club stories')} aria-roledescription="carousel" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setHovered(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setHovered(false) }}>
    <div className="blog-showcase-slides">
      {slides.map((slide, i) => <div key={`${i}-${slide.path}`} data-position={slide.position === 'right' ? 'right' : 'left'} data-tone={slide.tone === 'dark' ? 'dark' : 'light'} className={`blog-showcase-slide${i === active ? ' is-active' : ''}`} inert={i !== active} aria-hidden={i !== active}>
        {i === active && <HeroPhoto Image={Image} slide={slide} priority={i === 0} siteTitle={site.title} />}
        <div className="blog-showcase-caption"><div><p>{site.subtitle}</p><h1>{slide.title}</h1><p>{slide.subtitle}</p></div><a className="blog-showcase-cta" href={safePublicLink(slide.link) || '/activities'}><span>{slide.cta || ({ '/bookroom': t('浏览书坊', 'Browse books'), '/activities': t('查看活动记录', 'Explore activities'), '/news': t('阅读学会资讯', 'Read club news'), '/about': t('认识华文学会', 'About the club') }[slide.link] || t('探索我们的故事', 'Explore our stories'))}</span><ArrowRight size={18} /></a></div>
      </div>)}
    </div>
    {slides.length > 1 && <div className="blog-showcase-controls"><div className="blog-showcase-dots">{slides.map((slide, i) => <button key={i} title={slide.title} aria-label={`${t('显示画面', 'Show slide')} ${i + 1}: ${slide.title}`} aria-pressed={active === i} onClick={() => setIndex(i)} />)}</div><span className="blog-showcase-count">{active + 1} / {slides.length}</span><button className="blog-showcase-prev" aria-label={t('上一张', 'Previous slide')} onClick={() => setIndex(i => (i + slides.length - 1) % slides.length)}><ChevronLeft size={18} /></button><button className="blog-showcase-next" aria-label={t('下一张', 'Next slide')} onClick={() => setIndex(i => (i + 1) % slides.length)}><ChevronRight size={18} /></button></div>}
  </section>
}
