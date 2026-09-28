import { useEffect, useState } from 'react'
import { EditorContent, useEditor, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import TextAlign from '@tiptap/extension-text-align'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TextStyle, Color } from '@tiptap/extension-text-style'
import Highlight from '@tiptap/extension-highlight'
import { Bold, Italic, Underline, Strikethrough, Subscript as SubIcon, Superscript as SupIcon, AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered, Quote, Minus, Undo2, Redo2, Link, Unlink, ImagePlus } from 'lucide-react'
import { StudioImage } from '../pages/BlogStudioMedia'
import { plainDocument, photoWidth } from '../utils/blogRichText'
import './BlogRichEditor.css'

function PhotoView({ node, selected }) {
  return <NodeViewWrapper className={`blog-editor-photo ${selected ? 'is-selected' : ''}`} style={{ width: `${photoWidth(node.attrs.width)}%` }}><StudioImage path={node.attrs.path} /></NodeViewWrapper>
}
const Photo = Node.create({
  name: 'photo', group: 'block', atom: true, draggable: true,
  addAttributes: () => ({ path: { default: '' }, width: { default: 100 } }),
  parseHTML: () => [],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-blog-photo': '' })],
  addNodeView: () => ReactNodeViewRenderer(PhotoView),
})

export default function BlogRichEditor({ document, text, onChange, disabled, media, en }) {
  const t = (zh, english) => en ? english : zh
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState('')
  const [photosOpen, setPhotosOpen] = useState(false)
  const [more, setMore] = useState(false)
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false, autolink: false } }), TextAlign.configure({ types: ['heading', 'paragraph'] }), Subscript, Superscript, TextStyle, Color, Highlight.configure({ multicolor: true }), Photo],
    content: document?.type === 'doc' ? document : plainDocument(text),
    editable: !disabled, shouldRerenderOnTransaction: true,
    editorProps: { attributes: { role: 'textbox', 'aria-label': t('正文', 'Body'), 'aria-multiline': 'true' } },
    onUpdate: ({ editor }) => onChange(editor.getJSON(), editor.getText()),
  })
  useEffect(() => { editor?.setEditable(!disabled, false) }, [editor, disabled])
  if (!editor) return null
  const button = (Icon, label, command, active = false, unavailable = false) => <button key={label} type="button" title={label} aria-label={label} aria-pressed={active} disabled={disabled || unavailable} onClick={command}><Icon size={18} /></button>
  const commands = [
    [Bold, t('粗体', 'Bold'), 'toggleBold', 'bold'], [Italic, t('斜体', 'Italic'), 'toggleItalic', 'italic'],
    [Underline, t('下划线', 'Underline'), 'toggleUnderline', 'underline'], [Strikethrough, t('删除线', 'Strikethrough'), 'toggleStrike', 'strike'],
    [SubIcon, t('下标', 'Subscript'), 'toggleSubscript', 'subscript'], [SupIcon, t('上标', 'Superscript'), 'toggleSuperscript', 'superscript'],
    [List, t('项目列表', 'Bullet list'), 'toggleBulletList', 'bulletList'], [ListOrdered, t('编号列表', 'Numbered list'), 'toggleOrderedList', 'orderedList'],
    [Quote, t('引用', 'Quote'), 'toggleBlockquote', 'blockquote'],
  ]
  return <div className="blog-rich-editor">
    <div className="blog-editor-toolbar" role="group" aria-label={t('正文格式', 'Text formatting')}>
      <select aria-label={t('段落样式', 'Paragraph style')} disabled={disabled} value={editor.isActive('heading') ? editor.getAttributes('heading').level : 'p'} onChange={e => e.target.value === 'p' ? editor.chain().focus().setParagraph().run() : editor.chain().focus().setHeading({ level: Number(e.target.value) }).run()}><option value="p">{t('正文', 'Paragraph')}</option>{[1, 2, 3].map(level => <option key={level} value={level}>H{level}</option>)}</select>
      {commands.filter((_, index) => more || ![3, 4, 5].includes(index)).map(([Icon, label, command, active]) => button(Icon, label, () => editor.chain().focus()[command]().run(), editor.isActive(active)))}
      {more && [[AlignLeft, 'left', t('左对齐', 'Align left')], [AlignCenter, 'center', t('居中', 'Center')], [AlignRight, 'right', t('右对齐', 'Align right')], [AlignJustify, 'justify', t('两端对齐', 'Justify')]].map(([Icon, align, label]) => button(Icon, label, () => editor.chain().focus().setTextAlign(align).run(), editor.isActive({ textAlign: align })))}
      {more && <input type="color" aria-label={t('文字颜色', 'Text color')} title={t('文字颜色', 'Text color')} disabled={disabled} value={editor.getAttributes('textStyle').color || '#183f57'} onChange={e => editor.chain().focus().setColor(e.target.value).run()} />}
      {more && <input type="color" aria-label={t('荧光标记', 'Highlight')} title={t('荧光标记', 'Highlight')} disabled={disabled} value={editor.getAttributes('highlight').color || '#fff0a6'} onChange={e => editor.chain().focus().setHighlight({ color: e.target.value }).run()} />}
      {button(Link, t('添加链接', 'Add link'), () => { setLink(editor.getAttributes('link').href || ''); setLinkOpen(v => !v) }, editor.isActive('link'))}
      {button(Unlink, t('移除链接', 'Remove link'), () => editor.chain().focus().unsetLink().run(), false, !editor.isActive('link'))}
      {button(ImagePlus, t('插入已上传照片', 'Insert uploaded photo'), () => setPhotosOpen(v => !v))}
      {more && button(Minus, t('分隔线', 'Horizontal rule'), () => editor.chain().focus().setHorizontalRule().run())}
      {button(Undo2, t('撤销', 'Undo'), () => editor.chain().focus().undo().run(), false, !editor.can().undo())}
      {button(Redo2, t('重做', 'Redo'), () => editor.chain().focus().redo().run(), false, !editor.can().redo())}
      <button type="button" className="blog-editor-more" aria-expanded={more} onClick={() => setMore(v => !v)}>{more ? t('收起格式', 'Less') : t('更多格式', 'More')}</button>
    </div>
    {linkOpen && <div className="blog-editor-options"><label>URL<input type="url" value={link} onChange={e => { setLink(e.target.value); setLinkError('') }} aria-invalid={!!linkError} /></label><button type="button" onClick={() => { try { const url = new URL(link); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error(); editor.chain().focus().extendMarkRange('link').setLink({ href: url.href }).run(); setLinkOpen(false) } catch { setLinkError(t('请输入有效的 HTTP(S) 网址。', 'Enter a valid HTTP(S) URL.')) } }}>{t('插入链接', 'Insert link')}</button>{linkError && <p role="alert">{linkError}</p>}</div>}
    {photosOpen && <div className="blog-editor-options"><select aria-label={t('选择正文照片', 'Choose body photo')} defaultValue="" onChange={e => { if (e.target.value) editor.chain().focus().insertContent({ type: 'photo', attrs: { path: e.target.value, width: 100 } }).run(); setPhotosOpen(false) }}><option value="">{media.length ? t('选择照片', 'Choose photo') : t('请先保存内容并上传照片', 'Save and upload photos first')}</option>{media.map((photo, i) => <option key={photo.id} value={photo.path}>{photo.caption || `${t('照片', 'Photo')} ${i + 1}`}</option>)}</select></div>}
    {editor.isActive('photo') && <label className="blog-editor-options">{t('正文照片宽度', 'Body photo width')} <span>{photoWidth(editor.getAttributes('photo').width)}%</span><input type="range" min="25" max="100" step="5" value={photoWidth(editor.getAttributes('photo').width)} onChange={e => editor.chain().updateAttributes('photo', { width: Number(e.target.value) }).run()} /></label>}
    <EditorContent editor={editor} />
  </div>
}
