export default function BlogHeroOptions({ value, onChange, en }) {
  const t = (zh, english) => en ? english : zh
  return <div className="bs-form-grid">
    <label>{t('电脑文字位置', 'Desktop text position')}<select value={value.position || 'left'} onChange={e => onChange('position', e.target.value)}><option value="left">{t('左侧', 'Left')}</option><option value="right">{t('右侧', 'Right')}</option></select></label>
    <label>{t('文字明暗', 'Text contrast')}<select value={value.tone || 'light'} onChange={e => onChange('tone', e.target.value)}><option value="light">{t('深色文字 · 浅色衬底', 'Dark text · light backdrop')}</option><option value="dark">{t('浅色文字 · 深色衬底', 'Light text · dark backdrop')}</option></select></label>
  </div>
}
