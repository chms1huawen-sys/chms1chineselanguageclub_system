import { Loader } from 'lucide-react'

export default function PageLoading({ lang = 'zh', fullPage = false }) {
  return <div role="status" className={`page-loading${fullPage ? ' page-loading-full' : ''}`}><Loader className="page-loading-icon" size={22} aria-hidden="true" /><span>{lang === 'zh' ? '正在加载…' : 'Loading…'}</span></div>
}
