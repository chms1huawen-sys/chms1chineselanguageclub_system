import { useRef, useState } from 'react'
import { ChevronDown, Globe } from 'lucide-react'
import { siInstagram, siFacebook, siWhatsapp } from 'simple-icons'
import { publicHomeUrl } from '../utils/pwaLaunch'
import { sections, publicCategories, safePublicLink, safeColor } from '../utils/blogContent'

export function SocialLinks({ links = [] }) {
  const icons = { instagram: siInstagram, facebook: siFacebook, whatsapp: siWhatsapp }
  return <div className="blog-social-links">{(Array.isArray(links) ? links : []).filter(link => link && link.enabled !== false && link.label && safePublicLink(link.url)).map((link, i) => {
    const icon = icons[link.platform]
    return <a key={i} href={safePublicLink(link.url)} target="_blank" rel="noopener noreferrer" aria-label={link.label} title={link.label}>{icon ? <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={icon.path} /></svg> : <Globe size={20} />}<span>{link.label}</span></a>
  })}</div>
}

export default function BlogNavigation({ categories, pathname, en }) {
  const [open, setOpen] = useState('')
  const openedByHover = useRef(false)
  return <nav aria-label={en ? 'Main navigation' : '主导航'} onKeyDown={e => { if (e.key === 'Escape') { setOpen(''); e.target.closest('.blog-menu-item')?.querySelector('button')?.focus() } }}>
    {sections.map(section => {
      const dropdown = ['article', 'event'].includes(section.type)
      const cats = publicCategories(categories, section.type)
      const visible = open === section.path
      return <div className="blog-menu-item" key={section.path}
        onMouseEnter={() => { if (dropdown && window.matchMedia('(hover: hover)').matches) { openedByHover.current = true; setOpen(section.path) } }}
        onMouseLeave={() => setOpen('')}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen('') }}>
        <a href={section.path === '/' ? publicHomeUrl() : section.path} aria-current={pathname === section.path ? 'page' : undefined}>{en ? section.en : section.zh}</a>
        {dropdown && <><button type="button" aria-label={`${en ? section.en : section.zh}${en ? ' categories' : '分类'}`} aria-expanded={visible} aria-controls={`menu-${section.type}`} onClick={event => { setOpen(event.detail && openedByHover.current ? section.path : visible ? '' : section.path); openedByHover.current = false }}><ChevronDown size={16} /></button>
          <div id={`menu-${section.type}`} className={`blog-mega-menu ${visible ? 'is-open' : ''}`} inert={!visible}>
            {cats.filter(cat => !cat.parent_id).map(cat => <div key={cat.id}><a href={`${section.path}?category=${cat.id}`}><span style={{ color: safeColor(cat.color) }}>{cat.icon}</span>{cat.name}</a>{cats.filter(child => child.parent_id === cat.id).map(child => <a className="blog-subcategory" key={child.id} href={`${section.path}?category=${child.id}`}>{child.icon} {child.name}</a>)}</div>)}
            {!cats.length && <a href={section.path}>{en ? 'View all' : '查看全部'}</a>}
          </div></>}
      </div>
    })}
  </nav>
}
