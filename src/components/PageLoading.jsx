import { Loader } from 'lucide-react'

export default function PageLoading({ lang = 'zh' }) {
  return <div role="status" className="flex items-center justify-center gap-3 p-8" style={{ color: '#28566b', minHeight: 180 }}><Loader size={22} aria-hidden="true" /><span>{lang === 'zh' ? '正在加载…' : 'Loading…'}</span></div>
}
