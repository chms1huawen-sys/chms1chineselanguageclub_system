import { useId, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import './CollapsiblePerformanceCards.css'

export default function CollapsiblePerformanceCards({ children, count, lang }) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  return <div className="performance-cards-section" data-count={Math.min(count, 4)}>
    <div id={id} className={`performance-cards-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 ${expanded ? 'is-expanded' : ''}`}>{children}</div>
    <button className="performance-cards-toggle" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}>
      {expanded ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
      {expanded ? (lang === 'zh' ? '收起' : 'Show less') : (lang === 'zh' ? `展开全部（共 ${count} 人）` : `Show all (${count} members)`)}
    </button>
  </div>
}
