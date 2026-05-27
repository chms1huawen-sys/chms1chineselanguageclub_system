// src/components/PositionSelect.jsx
// 用于 Members.jsx 的职务/角色选择器
// 支持全部系统预设角色 + 自定义职称输入（会保存到 users.custom_role_label）

import { useState, useEffect } from 'react'

// 与 Members.jsx 完全同步的完整角色列表
const ROLE_OPTIONS = [
  { value: 'convener_teacher', zh: '召集老师', en: 'Convener Teacher' },
  { value: 'advisor_teacher',  zh: '指导老师', en: 'Advisor Teacher' },
  { value: 'chairperson',      zh: '主席',     en: 'President' },
  { value: 'vice_chairperson', zh: '副主席',   en: 'Vice President' },
  { value: 'secretary',        zh: '正文书',   en: 'Secretary' },
  { value: 'vice_secretary',   zh: '副文书',   en: 'Vice Secretary' },
  { value: 'treasurer',        zh: '正财政',   en: 'Treasurer' },
  { value: 'vice_treasurer',   zh: '副财政',   en: 'Vice Treasurer' },
  { value: 'general_affairs',       zh: '正总务',     en: 'General Affairs' },
  { value: 'vice_general_affairs',  zh: '副总务',     en: 'Vice General Affairs' },
  { value: 'activity_lead',         zh: '活动组组长', en: 'Activity Lead' },
  { value: 'vice_activity_lead',    zh: '活动组副组长', en: 'Vice Activity Lead' },
  { value: 'activity_member',       zh: '活动组组员', en: 'Activity Member' },
  { value: 'media_lead',            zh: '正摄影', en: 'Photographer' },
  { value: 'vice_media_lead',       zh: '副摄影', en: 'Vice Photographer' },
  { value: 'ordinary_member',       zh: '普通会员', en: 'Ordinary Member' },
]

// 'custom' 是数据库合法值，单独列出作为自定义触发项
const CUSTOM_TRIGGER = '__custom__'

const selectStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 14,
  border: '1.5px solid #95CBFF',
  background: '#f0f7ff',
  color: '#1a1a1a',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "'Nunito', sans-serif",
  outline: 'none',
}

const inputStyle = {
  ...selectStyle,
  marginTop: 8,
}

/**
 * Props:
 * - value: string        — 当前角色值（DB role 字段，如 'chairperson' 或 'custom'）
 * - onChange: fn         — (newValue: string) => void，只发射合法 DB 角色值
 * - customLabel: string  — 自定义职称显示名称
 * - onCustomLabelChange: fn — (label: string) => void
 * - disabled: boolean
 * - lang: 'zh' | 'en'
 */
export default function PositionSelect({ value, onChange, customLabel = '', onCustomLabelChange, disabled = false, lang = 'zh' }) {
  const isPreset = ROLE_OPTIONS.some(r => r.value === value)
  const [mode, setMode] = useState(isPreset ? 'preset' : 'custom')

  // 外部 value 改变时同步
  useEffect(() => {
    const preset = ROLE_OPTIONS.some(r => r.value === value)
    if (preset) {
      setMode('preset')
    } else {
      setMode('custom')
    }
  }, [value])

  const handleSelectChange = (e) => {
    const selected = e.target.value
    if (selected === CUSTOM_TRIGGER) {
      setMode('custom')
      onCustomLabelChange?.('')
      onChange('custom')       // 存入 DB 的值仍是合法的 'custom'
    } else {
      setMode('preset')
      onCustomLabelChange?.('')
      onChange(selected)
    }
  }

  const selectValue = mode === 'custom' ? CUSTOM_TRIGGER : (value || 'ordinary_member')

  const label = lang === 'zh' ? '系统角色与职务' : 'Role'
  const customPlaceholder = lang === 'zh'
    ? '输入自定义职称，如：宣传组组长、美食节主任...'
    : 'Custom title, e.g. Publicity Lead, Event Director...'
  const customPreview = lang === 'zh'
    ? `预览职称：「${customLabel}」（会保存为显示职称）`
    : `Preview: "${customLabel}" (saved as display title)`
  const customNote = lang === 'zh'
    ? '系统权限类型会保存为「自定义」，这里输入的文字会作为成员职称显示。'
    : 'The permission role is stored as "custom"; this text is saved as the displayed title.'

  return (
    <div>
      <label className="block text-xs font-black uppercase tracking-wider mb-1.5"
        style={{ color: '#6b7280' }}>
        {label}
      </label>

      {/* 主选择框 */}
      <select
        value={selectValue}
        onChange={handleSelectChange}
        disabled={disabled}
        style={{ ...selectStyle, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}
      >
        {ROLE_OPTIONS.map(r => (
          <option key={r.value} value={r.value}>
            {r.zh}
          </option>
        ))}
        {/* 自定义选项 */}
        <option value={CUSTOM_TRIGGER}>✏️ {lang === 'zh' ? '自定义职称...' : 'Custom title...'}</option>
      </select>

      {/* 自定义职称文字输入（显示用途）*/}
      {mode === 'custom' && (
        <>
          <input
            type="text"
            value={customLabel}
            onChange={(e) => onCustomLabelChange?.(e.target.value)}
            placeholder={customPlaceholder}
            disabled={disabled}
            maxLength={50}
            style={{ ...inputStyle, opacity: disabled ? 0.6 : 1 }}
          />

          {customLabel && (
            <p className="text-[11px] font-semibold mt-1" style={{ color: '#95CBFF' }}>
              {customPreview}
            </p>
          )}

          <p className="text-[10px] font-semibold mt-1.5 p-2 rounded-xl"
            style={{ background: '#fef9c3', color: '#ca8a04', border: '1px solid #fde047' }}>
            {customNote}
          </p>
        </>
      )}
    </div>
  )
}
