import { ArrowRight, ChevronDown } from 'lucide-react'
import { SocialLinks } from './BlogNavigation'

export default function BookPurchase({ details = {}, en = false }) {
  const links = (Array.isArray(details.purchase_links) ? details.purchase_links : []).filter(link => {
    try {
      const url = new URL(link.url)
      return link.enabled !== false && link.label?.trim() && ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
    } catch { return false }
  })
  if (!links.length) return null
  const label = details.purchase_label?.trim() || (en ? 'Contact us to purchase' : '联系购买')
  if (links.length === 1) return <a className="blog-purchase-button" href={links[0].url} target="_blank" rel="noopener noreferrer">{label}<ArrowRight size={18} /></a>
  return <details className="blog-purchase" onKeyDown={event => {
    if (event.key === 'Escape') { event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus() }
  }}><summary className="blog-purchase-button">{label}<ChevronDown size={18} /></summary><div className="blog-purchase-options"><SocialLinks links={links} /></div></details>
}
