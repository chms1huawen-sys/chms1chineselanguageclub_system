import { useState } from 'react'
import { ArrowUp, ArrowDown, RotateCcw } from 'lucide-react'
import { LOGIN_DEFAULTS, loginPresentation } from '../utils/loginPresentation'
import LoginPhoto from './LoginPhoto'
import './LoginSettingsEditor.css'

export default function LoginSettingsEditor({ value, onChange, upload, onCrop, en }) {
  const settings = loginPresentation(value)
  const [selected, setSelected] = useState(0)
  const [previewEnglish, setPreviewEnglish] = useState(en)
  const t = (zh, english) => en ? english : zh
  const change = (key, next) => onChange({ ...settings, [key]: next })
  const changeSlide = (index, key, next) => change('slides', settings.slides.map((slide, i) => i === index ? { ...slide, [key]: next } : slide))
  const photo = settings.slides[selected]
  return <section className="bs-section" id="member-login-settings">
    <div className="bs-section-heading"><h2>{t('会员登录页', 'Member login page')}</h2><button type="button" onClick={() => { if (window.confirm(t('恢复登录页默认照片和文字？保存设置后生效。', 'Restore default login photos and text? Save settings to apply.'))) onChange(structuredClone(LOGIN_DEFAULTS)) }}><RotateCcw size={17} />{t('恢复默认', 'Restore defaults')}</button></div>
    <div className="bs-form-grid">{[['title', '系统标题', 'System title'], ['subtitle', '系统简介', 'System subtitle'], ['footer', '页脚文字', 'Footer text']].flatMap(([key, zh, english]) => [
      <label key={key}>{t(`${zh}（中文）`, `${english} (Chinese)`)}<input maxLength={300} value={settings[key]} onChange={e => change(key, e.target.value)} /></label>,
      <label key={`${key}_en`}>{t(`${zh}（英文）`, `${english} (English)`)}<input maxLength={300} value={settings[`${key}_en`]} onChange={e => change(`${key}_en`, e.target.value)} /></label>,
    ])}</div>
    <div className="bs-slides">{settings.slides.map((slide, index) => <div className="bs-slide" key={index}>
      <div className="bs-slide-image"><div className="login-settings-photo"><LoginPhoto key={slide.path} slide={slide} en={en} /></div><label>{t(`照片 ${index + 1}`, `Photo ${index + 1}`)}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { upload(event.target.files[0], path => onChange({ ...settings, slides: settings.slides.map((item, i) => i === index ? { ...item, path, crop: null } : item) })); event.target.value = '' }} /></label><button type="button" onClick={() => onCrop({ path: slide.path, value: slide.crop, save: crop => changeSlide(index, 'crop', crop) })}>{t('裁切照片', 'Crop photo')}</button></div>
      <div className="bs-slide-fields">{[['eyebrow', '上方小字', 'Eyebrow'], ['title', '照片主标题', 'Photo title']].flatMap(([key, zh, english]) => [
        <label key={key}>{t(`${zh}（中文）`, `${english} (Chinese)`)}<input maxLength={300} value={slide[key]} onChange={e => changeSlide(index, key, e.target.value)} /></label>,
        <label key={`${key}_en`}>{t(`${zh}（英文）`, `${english} (English)`)}<input maxLength={300} value={slide[`${key}_en`]} onChange={e => changeSlide(index, `${key}_en`, e.target.value)} /></label>,
      ])}<div className="bs-actions"><button type="button" title={t('前移', 'Move up')} aria-label={t(`照片 ${index + 1} 前移`, `Move photo ${index + 1} up`)} disabled={!index} onClick={() => change('slides', [...settings.slides].reverse())}><ArrowUp size={17} /></button><button type="button" title={t('后移', 'Move down')} aria-label={t(`照片 ${index + 1} 后移`, `Move photo ${index + 1} down`)} disabled={index === 1} onClick={() => change('slides', [...settings.slides].reverse())}><ArrowDown size={17} /></button></div></div>
    </div>)}</div>
    <div className="bs-section-heading"><h3>{t('预览', 'Preview')}</h3><div className="bs-actions"><select aria-label={t('预览照片', 'Preview photo')} value={selected} onChange={e => setSelected(Number(e.target.value))}>{settings.slides.map((_, index) => <option key={index} value={index}>{t(`照片 ${index + 1}`, `Photo ${index + 1}`)}</option>)}</select><select aria-label={t('预览语言', 'Preview language')} value={previewEnglish ? 'en' : 'zh'} onChange={e => setPreviewEnglish(e.target.value === 'en')}><option value="zh">中文</option><option value="en">English</option></select></div></div>
    <div className="login-settings-preview"><div className="login-settings-photo"><LoginPhoto key={photo.path} slide={photo} en={previewEnglish} /><div className="login-settings-caption"><small>{photo[previewEnglish ? 'eyebrow_en' : 'eyebrow']}</small><strong>{photo[previewEnglish ? 'title_en' : 'title']}</strong></div></div><div className="login-settings-copy"><h3>{settings[previewEnglish ? 'title_en' : 'title']}</h3><p>{settings[previewEnglish ? 'subtitle_en' : 'subtitle']}</p><small>{settings[previewEnglish ? 'footer_en' : 'footer']}</small></div></div>
  </section>
}
