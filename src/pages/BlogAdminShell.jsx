import { publicHomeUrl } from '../utils/pwaLaunch'
import { SOURCE_ORIGIN } from '../utils/siteOrigins.js'
import { useEffect, useState } from 'react'
import { blogData } from '../utils/blogData'
import { readBlogBootstrap } from '../utils/blogBootstrap'
import { Globe, ArrowLeft, LogIn } from 'lucide-react'
import BlogManagement from './BlogManagement'
import { blogLogin, canManageBlog } from '../utils/blog'
import './Blog.css'
import { brandedSettings, pageTitle, SITE_NAME } from '../utils/siteBrand'

const executiveUrl = SOURCE_ORIGIN + '/member#/executive-management'

export default function BlogAdminShell({ profile, loading, lang, setLang }) {
  const en = lang === 'en'
  const [site, setSite] = useState(readBlogBootstrap)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    blogData.from('blog_settings').select('title,subtitle,content').eq('id', 1).single()
      .then(({ data, error }) => { if (active) { if (error) setFailed(true); else setSite(brandedSettings(data)) } })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    document.title = site?.title ? pageTitle(en ? 'Blog administration' : '文章后台', site) : SITE_NAME
  }, [site, en])
  return <div className="club-blog blog-admin-shell">
    <header className="blog-nav">
      <a className="blog-brand" href={publicHomeUrl()}><img src="/logo-192.png" alt="" /><span>{site?.title || (failed ? (en ? 'Website' : '公开网站') : <span role="status" aria-label={en ? 'Loading website name' : '载入网站名称'}>…</span>)}<small>{en ? 'Blog administration' : '文章后台'}</small></span></a>
      <nav><button onClick={() => setLang(en ? 'zh' : 'en')}><Globe size={17} />{en ? '中文' : 'English'}</button><a href={executiveUrl}><ArrowLeft size={17} />{en ? 'Back to Executive Management' : '返回执委层管理'}</a></nav>
    </header>
    <main className="blog-main">
      {loading ? <div className="blog-skeleton" aria-label={en ? 'Loading' : '载入中'} /> : !profile ? <section className="blog-empty"><h1>{en ? 'Administrator login required' : '请先登入管理账号'}</h1><a className="blog-primary" href={blogLogin('/blog-admin')}><LogIn size={18} />{en ? 'Log in' : '登入'}</a></section> : canManageBlog(profile) ? <BlogManagement profile={profile} lang={lang} onSiteChange={value => setSite(brandedSettings(value))} /> : <section className="blog-empty"><h1>{en ? 'Manage Blog access is restricted' : '没有可管理博客权限'}</h1><a href={executiveUrl}>{en ? 'Back to Executive Management' : '返回执委层管理'}</a></section>}
    </main>
  </div>
}
