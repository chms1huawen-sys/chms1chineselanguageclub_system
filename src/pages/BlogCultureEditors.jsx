import { useState } from 'react'
import { Plus, Trash2, Pencil, ArrowUp, ArrowDown, Save } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { ordered, safeColor, sections } from '../utils/blogContent'

export function SocialEditor({ value = [], onChange, en }) {
  const t = (zh, english) => en ? english : zh
  const update = (index, key, next) => onChange(value.map((link, i) => i === index ? { ...link, [key]: next } : link))
  const move = (index, direction) => { const next = [...value]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; onChange(next) }
  return <section className="bs-section"><div className="bs-section-heading"><h3>{t('社交媒体链接', 'Social links')}</h3><button type="button" onClick={() => onChange([...value, { platform: 'instagram', label: 'Instagram', url: '', enabled: true }])}><Plus size={16} />{t('新增', 'Add')}</button></div>{value.map((link, index) => <div className="bs-link-row" key={index}>
    <label>{t('名称', 'Label')}<input required value={link.label} onChange={e => update(index, 'label', e.target.value)} /></label>
    <label>{t('网址', 'URL')}<input type="url" required value={link.url} onChange={e => update(index, 'url', e.target.value)} /></label>
    <label>{t('平台图标', 'Platform icon')}<select value={link.platform} onChange={e => update(index, 'platform', e.target.value)}>{['instagram', 'facebook', 'whatsapp', 'website'].map(v => <option key={v} value={v}>{v === 'website' ? t('其他网站', 'Other website') : v}</option>)}</select></label>
    <label className="bs-checks"><input type="checkbox" checked={link.enabled !== false} onChange={e => update(index, 'enabled', e.target.checked)} />{t('显示', 'Visible')}</label>
    <div className="bs-actions"><button type="button" title={t('前移', 'Move up')} disabled={!index} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" title={t('后移', 'Move down')} disabled={index === value.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button type="button" title={t('移除', 'Remove')} onClick={() => onChange(value.filter((_, i) => i !== index))}><Trash2 size={16} /></button></div>
  </div>)}</section>
}

export function BookEditor({ value = {}, onChange, en }) {
  const t = (zh, english) => en ? english : zh
  const change = (key, next) => onChange({ ...value, [key]: next })
  return <section className="bs-section"><h3>{t('书籍资料', 'Book details')}</h3><div className="bs-form-grid">{[['author', '作者', 'Author', 'text'], ['price', '价格（例如 RM 20）', 'Price (e.g. RM 20)', 'text'], ['published_on', '出版日期', 'Publication date', 'date'], ['pages', '页数', 'Pages', 'number'], ['isbn', 'ISBN', 'ISBN', 'text']].map(([key, zh, english, type]) => <label key={key}>{t(zh, english)}<input type={type} min={type === 'number' ? 1 : undefined} value={value[key] || ''} onChange={e => change(key, e.target.value)} /></label>)}</div><label>{t('作者介绍（选填）', 'Author biography (optional)')}<textarea rows={4} value={value.author_bio || ''} onChange={e => change('author_bio', e.target.value)} /></label><SocialEditor value={value.purchase_links || []} onChange={links => change('purchase_links', links)} en={en} /></section>
}

const blank = { name: '', section: 'article', parent_id: '', icon: '', color: '#28688e', position: 0, is_visible: true, group_name: '' }
export function CultureTaxonomy({ data, busy, run, reload, en, setDirty }) {
  const t = (zh, english) => en ? english : zh
  const [kind, setKind] = useState('categories')
  const [form, setForm] = useState(blank)
  const [changed, setChanged] = useState(false)
  const reset = () => { setForm(blank); setDirty(false); setChanged(false) }
  const change = (key, value) => { setForm(old => ({ ...old, [key]: value, ...(key === 'section' ? { parent_id: '' } : {}) })); setDirty(true); setChanged(true) }
  const discard = () => !changed || window.confirm(t('放弃未保存的修改？', 'Discard unsaved changes?'))
  async function checked(query) { const result = await query; if (result.error) throw result.error; return result.data }
  const rows = ordered(data[kind])
  return <section><div className="bs-quick">{[['categories', '分类', 'Categories'], ['tags', '标签', 'Tags']].map(([id, zh, english]) => <button disabled={busy} key={id} aria-pressed={kind === id} onClick={() => { if (discard()) { setKind(id); reset() } }}>{t(zh, english)}</button>)}</div>
    <form className="bs-editor" onSubmit={e => { e.preventDefault(); run(async () => {
      const values = { name: form.name.trim(), icon: form.icon.trim(), color: form.color, position: Number(form.position), is_visible: form.is_visible, ...(kind === 'categories' ? { section: form.section, parent_id: form.parent_id || null } : { group_name: form.group_name.trim() }) }
      await checked(form.id ? supabase.from(`blog_${kind}`).update(values).eq('id', form.id) : supabase.from(`blog_${kind}`).insert(values))
      reset(); await reload()
    }) }}><fieldset disabled={busy}><div className="bs-form-grid">
      <label>{t('名称', 'Name')}<input required maxLength={kind === 'tags' ? 60 : 80} value={form.name} onChange={e => change('name', e.target.value)} /></label>
      {kind === 'categories' ? <><label>{t('栏目', 'Section')}<select aria-label={t('栏目', 'Section')} value={form.section} onChange={e => change('section', e.target.value)}><option value="all">{t('共用分类', 'Shared')}</option>{sections.filter(s => s.type).map(s => <option key={s.type} value={s.type}>{en ? s.en : s.zh}</option>)}</select></label><label>{t('上级分类', 'Parent category')}<select aria-label={t('上级分类', 'Parent category')} value={form.parent_id || ''} onChange={e => change('parent_id', e.target.value)}><option value="">{t('无', 'None')}</option>{data.categories.filter(cat => !cat.parent_id && cat.section === form.section && cat.id !== form.id).map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select></label></> : <label>{t('标签组', 'Tag group')}<input maxLength={80} value={form.group_name} onChange={e => change('group_name', e.target.value)} /></label>}
      <label>{t('Emoji / 符号（选填）', 'Emoji / symbol (optional)')}<input maxLength={16} value={form.icon} onChange={e => change('icon', e.target.value)} /></label>
      <label>{t('颜色', 'Colour')}<input type="color" value={safeColor(form.color)} onChange={e => change('color', e.target.value)} /></label>
      <label>{t('排序（小的排前面）', 'Order (lower first)')}<input required type="number" value={form.position} onChange={e => change('position', e.target.value)} /></label>
      <label className="bs-checks"><input type="checkbox" checked={form.is_visible} onChange={e => change('is_visible', e.target.checked)} />{t('公开显示', 'Show publicly')}</label>
    </div><div className="bs-actions"><button className="bs-primary"><Save size={16} />{t('保存', 'Save')}</button>{form.id && <button type="button" onClick={() => { if (discard()) reset() }}>{t('取消', 'Cancel')}</button>}</div></fieldset></form>
    <div className="bs-table-wrap"><table className="bs-table"><thead><tr><th>{t('名称', 'Name')}</th><th>{t('栏目 / 分组', 'Section / group')}</th><th>{t('排序', 'Order')}</th><th>{t('显示', 'Visible')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><span style={{ color: safeColor(row.color) }}>{row.icon}</span> {row.name}</td><td>{kind === 'tags' ? row.group_name : (sections.find(s => s.type === row.section)?.[en ? 'en' : 'zh'] || t('共用', 'Shared'))}{row.parent_id && <small>{data.categories.find(cat => cat.id === row.parent_id)?.name}</small>}</td><td>{row.position || 0}</td><td>{row.is_visible !== false ? t('显示', 'Visible') : t('隐藏', 'Hidden')}</td><td><div className="bs-actions"><button disabled={busy} title={t('编辑', 'Edit')} onClick={() => { if (discard()) { setForm({ ...blank, ...row }); setDirty(false); setChanged(false) } }}><Pencil size={16} /></button><button disabled={busy} title={t('删除', 'Delete')} onClick={() => { if (window.confirm(t(`删除「${row.name}」？文章将保留；下级分类会成为顶级分类。`, `Delete "${row.name}"? Posts remain; child categories become top-level.`))) run(async () => { await checked(supabase.from(`blog_${kind}`).delete().eq('id', row.id)); if (form.id === row.id) reset(); await reload() }) }}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div>
  </section>
}
