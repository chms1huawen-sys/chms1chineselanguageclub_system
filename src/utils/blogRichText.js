import { createElement as h, Fragment } from 'react'

export function plainDocument(text = '') {
  return { type: 'doc', content: String(text).replace(/\r\n?/g, '\n').split('\n').map(text => ({
    type: 'paragraph',
    content: text ? [{ type: 'text', text }] : [],
  })) }
}

export const photoWidth = value => Math.max(25, Math.min(100, Number(value) || 100))
const color = value => /^#[\da-f]{6}$/i.test(value || '') ? value : undefined
const href = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined } catch { return undefined } }

// Render only the document vocabulary we support; never render stored HTML or arbitrary attributes.
export function richBody(document, fallback = '', Image, media = []) {
  const root = document?.type === 'doc' ? document : plainDocument(fallback)
  let count = 0
  function render(node, key, depth = 0) {
    if (!node || depth > 40 || ++count > 20000) return null
    const attrs = node.attrs || {}
    if (node.type === 'text') {
      let text = String(node.text || '')
      for (const mark of (Array.isArray(node.marks) ? node.marks : []).slice(0, 12)) {
        const tag = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', subscript: 'sub', superscript: 'sup', code: 'code' }[mark.type]
        if (tag) text = h(tag, null, text)
        else if (mark.type === 'link' && href(mark.attrs?.href)) text = h('a', { href: href(mark.attrs.href), target: '_blank', rel: 'noopener noreferrer' }, text)
        else if (mark.type === 'textStyle') text = h('span', { style: { color: color(mark.attrs?.color) } }, text)
        else if (mark.type === 'highlight') text = h('mark', { style: { backgroundColor: color(mark.attrs?.color) || '#fff0a6' } }, text)
      }
      return h(Fragment, { key }, text)
    }
    if (node.type === 'photo') {
      const photo = media.find(item => item.path === attrs.path)
      if (!photo || !Image) return null
      return h('figure', { key, className: 'blog-inline-photo', style: { width: `${photoWidth(attrs.width)}%` } }, h(Image, { path: photo.path, crop: photo.crop, alt: photo.caption || '', loading: 'lazy' }), photo.caption && h('figcaption', null, photo.caption))
    }
    const tag = { doc: 'div', paragraph: 'p', bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote', codeBlock: 'pre', hardBreak: 'br', horizontalRule: 'hr' }[node.type] || (node.type === 'heading' ? `h${Math.max(1, Math.min(3, Number(attrs.level) || 2))}` : null)
    if (!tag) return null
    const props = { key }
    if (['p', 'h1', 'h2', 'h3'].includes(tag) && ['left', 'center', 'right', 'justify'].includes(attrs.textAlign)) props.style = { textAlign: attrs.textAlign }
    if (tag === 'ol') props.start = Math.max(1, Math.min(9999, Number(attrs.start) || 1))
    // Match the editor's empty paragraph line box instead of collapsing blank lines.
    if (tag === 'p' && !node.content?.length) return h(tag, props, h('br'))
    const children = (Array.isArray(node.content) ? node.content : []).map((child, index) => render(child, index, depth + 1))
    if (tag === 'p' && node.content?.at(-1)?.type === 'hardBreak') children.push(h('br', { key: 'trailing-break' }))
    return h(tag, props, ['br', 'hr'].includes(tag) ? undefined : children)
  }
  return render(root, 'body')
}

export function galleryPreview(media, coverPath) {
  const photos = media.map((photo, index) => ({ photo, index })).filter(({ photo }) => photo.path !== coverPath)
  return { photos: photos.slice(0, 4), remaining: Math.max(0, photos.length - 4) }
}
