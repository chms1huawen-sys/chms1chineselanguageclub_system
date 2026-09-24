import { useId, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import './MobileDashboardList.css'

export default function MobileDashboardList({ children, count, label, lang, className }) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  return <>
    <div id={id} tabIndex={0} role="region" aria-label={label} className={`${className} dashboard-mobile-list ${expanded ? 'is-expanded' : ''}`}>{children}</div>
    {count > 2 && <button type="button" className="dashboard-mobile-list-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
      {expanded ? (lang === 'zh' ? '收起' : 'Show less') : (lang === 'zh' ? `展开全部（共 ${count} 条）` : `Show all (${count})`)}
    </button>}
  </>
}
