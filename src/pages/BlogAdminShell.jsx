import { publicHomeUrl } from '../utils/pwaLaunch'
import { Globe, ArrowLeft, LogIn } from 'lucide-react'
import BlogManagement from './BlogManagement'
import { blogLogin, canManageBlog } from '../utils/blog'
import './Blog.css'

export default function BlogAdminShell({ profile, loading, lang, setLang }) {
  const en = lang === 'en'
  return <div className="club-blog blog-admin-shell">
    <header className="blog-nav">
      <a className="blog-brand" href={publicHomeUrl()}><img src="/logo-192.png" alt="" /><span>{en ? 'CLC_sys' : '一中华文学会'}<small>{en ? 'Blog administration' : '文章后台'}</small></span></a>
      <nav><button onClick={() => setLang(en ? 'zh' : 'en')}><Globe size={17} />{en ? '中文' : 'English'}</button><a href={publicHomeUrl()}><ArrowLeft size={17} />{en ? 'Blog home' : '返回 Blog 首页'}</a></nav>
    </header>
    <main className="blog-main">
      {loading ? <div className="blog-skeleton" aria-label={en ? 'Loading' : '载入中'} /> : !profile ? <section className="blog-empty"><h1>{en ? 'Administrator login required' : '请先登入管理账号'}</h1><a className="blog-primary" href={blogLogin('/blog-admin')}><LogIn size={18} />{en ? 'Log in' : '登入'}</a></section> : canManageBlog(profile) ? <BlogManagement profile={profile} lang={lang} /> : <section className="blog-empty"><h1>{en ? 'Access restricted' : '没有文章后台管理权限'}</h1><a href={publicHomeUrl()}>{en ? 'Return to Blog' : '返回 Blog 首页'}</a></section>}
    </main>
  </div>
}
