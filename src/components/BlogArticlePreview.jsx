import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Monitor, Smartphone, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { ArticleContent, BlogImage } from '../pages/Blog'
import { safePublicLink } from '../utils/blogContent'

export default function BlogArticlePreview({ post, media, links, en, tagLibrary }) {
  const [size, setSize] = useState('desktop')
  const [frameDocument, setFrameDocument] = useState(null)
  const [photo, setPhoto] = useState(null)
  const t = (zh, english) => en ? english : zh
  function ready(event) {
    const doc = event.currentTarget.contentDocument
    // Isolate the public article from the administration's inherited form styles.
    doc.head.replaceChildren(...Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'), node => node.cloneNode(true)))
    doc.documentElement.lang = en ? 'en' : 'zh'
    doc.body.style.margin = '0'
    setFrameDocument(doc)
  }
  return <section className="bs-article-preview">
    <div className="bs-toolbar" role="group" aria-label={t('预览尺寸', 'Preview size')}>
      <button type="button" aria-pressed={size === 'desktop'} onClick={() => setSize('desktop')}><Monitor size={17} />{t('电脑', 'Desktop')}</button>
      <button type="button" aria-pressed={size === 'mobile'} onClick={() => setSize('mobile')}><Smartphone size={17} />{t('手机', 'Mobile')}</button>
    </div>
    <div className="bs-preview-scroll"><iframe srcDoc="<!doctype html><html><head></head><body></body></html>" className="bs-preview-frame" data-size={size} title={t('文章实际排版预览', 'Article layout preview')} onLoad={ready} /></div>
    {frameDocument && createPortal(<div className="club-blog blog-public">
      <main className="blog-main">
        <ArticleContent post={post} media={media} en={en} tagLibrary={tagLibrary} onPhoto={setPhoto} />
        {!!links.length && <section className="blog-download"><h2>{t('相关链接', 'Related links')}</h2><div className="blog-public-links">{links.filter(l => safePublicLink(l.url)).map((l, i) => <a key={l.id || i} href={safePublicLink(l.url)} target="_blank" rel="noopener noreferrer">{l.label}{l.visibility === 'member' && <small>{t('会员', 'Members')}</small>}</a>)}</div></section>}
      </main>
      {photo !== null && media[photo] && <div className="blog-lightbox" role="dialog" aria-modal="true" aria-label={t('照片预览', 'Photo preview')} onKeyDown={e => { if (e.key === 'Escape') setPhoto(null) }}>
        <button autoFocus className="blog-lightbox-close" aria-label={t('关闭', 'Close')} onClick={() => setPhoto(null)}><X /></button>
        <button aria-label={t('上一张', 'Previous photo')} onClick={() => setPhoto((photo + media.length - 1) % media.length)}><ChevronLeft /></button>
        <figure><BlogImage path={media[photo].path} alt={media[photo].caption || post.title} /><figcaption>{media[photo].caption || post.title} ({photo + 1}/{media.length})</figcaption></figure>
        <button aria-label={t('下一张', 'Next photo')} onClick={() => setPhoto((photo + 1) % media.length)}><ChevronRight /></button>
      </div>}
    </div>, frameDocument.body)}
  </section>
}
