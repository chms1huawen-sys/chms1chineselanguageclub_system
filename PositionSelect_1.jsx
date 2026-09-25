// src/components/PositionSelect.jsx
// 替换你 Members.jsx 里所有的 <select> 职务选择
// 支持预设选项 + 自定义输入

import { useState, useEffect } from 'react'

const PRESET_POSITIONS = [
  { value: 'advisor', label: '顾问老师 (Advisor)' },
  { value: 'chairperson', label: '主席 (Chairperson)' },
  { value: 'vice_chairperson', label: '副主席 (Vice Chairperson)' },
  { value: 'secretary', label: '秘书 (Secretary)' },
  { value: 'treasurer', label: '财政 (Treasurer)' },
  { value: 'committee', label: '部门干部 (Committee)' },
  { value: 'event_member', label: '筹委成员 (Event Member)' },
  { value: '__custom__', label: '✏️ 自定义职务...' },
]

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
 * - value: string  (当前值，可以是 preset value 或自定义字符串)
 * - onChange: (newValue: string) => void
 * - disabled: boolean
 * - label: string (可选，默认 "系统角色 / 职务 Role")
 */
export default function PositionSelect({ value, onChange, disabled = false, label = '系统角色 / 职务 Role' }) {
  const isPreset = PRESET_POSITIONS.some(p => p.value === value && p.value !== '__custom__')
  const [mode, setMode] = useState(isPreset ? 'preset' : 'custom')
  const [customText, setCustomText] = useState(isPreset ? '' : value || '')

  useEffect(() => {
    // 外部 value 变化时同步
    const preset = PRESET_POSITIONS.some(p => p.value === value && p.value !== '__custom__')
    if (preset) {
      setMode('preset')
    } else if (value) {
      setMode('custom')
      setCustomText(value)
    }
  }, [value])

  const handleSelectChange = (e) => {
    const selected = e.target.value
    if (selected === '__custom__') {
      setMode('custom')
      setCustomText('')
      onChange('')
    } else {
      setMode('preset')
      onChange(selected)
    }
  }

  const handleCustomChange = (e) => {
    const text = e.target.value
    setCustomText(text)
    onChange(text)
  }

  const selectValue = mode === 'custom' ? '__custom__' : (value || 'committee')

  return (
    <div>
      <label className="block text-xs font-black uppercase tracking-wider mb-1.5"
        style={{ color: '#6b7280' }}>
        {label}
      </label>

      <select
        value={selectValue}
        onChange={handleSelectChange}
        disabled={disabled}
        style={{ ...selectStyle, cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1 }}
      >
        {PRESET_POSITIONS.map(p => (
          <option key={p.value} value={p.value}>{p.label}</option>
        ))}
      </select>

      {mode === 'custom' && (
        <input
          type="text"
          value={customText}
          onChange={handleCustomChange}
          placeholder="输入自定义职务，如：宣传组组长、美食节主任..."
          disabled={disabled}
          maxLength={50}
          style={{ ...inputStyle, opacity: disabled ? 0.6 : 1 }}
        />
      )}

      {mode === 'custom' && customText && (
        <p className="text-xs font-semibold mt-1" style={{ color: '#95CBFF' }}>
          将保存为：「{customText}」
        </p>
      )}
    </div>
  )
}
