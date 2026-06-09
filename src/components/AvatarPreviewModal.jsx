import React from 'react'
import UserAvatar from './UserAvatar'

export default function AvatarPreviewModal({ user, lang = 'zh', onClose }) {
  if (!user) return null

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(149,203,255,0.18)', backdropFilter: 'blur(5px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 text-center"
        style={{ border: '1.5px solid #e0f1ff', boxShadow: '0 12px 40px rgba(149,203,255,0.28)' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-2xl font-black text-sm"
            style={{ background: '#f0f7ff', color: '#6b7280' }}
          >
            x
          </button>
        </div>

        <div className="flex justify-center -mt-2 mb-4">
          <UserAvatar user={user} size={128} rounded={32} />
        </div>

        <h3 className="text-lg font-black text-gray-900">{user.name || (lang === 'zh' ? '未知成员' : 'Unknown Member')}</h3>
        {user.email && <p className="text-xs font-semibold text-gray-400 mt-1 break-all">{user.email}</p>}
        {user.role && (
          <div className="mt-4 inline-flex px-3 py-1.5 rounded-full text-xs font-black"
            style={{ background: '#f0f7ff', color: '#4b8ed8', border: '1.5px solid #e0f1ff' }}>
            {user.custom_role_label || user.role}
          </div>
        )}
        {!user.avatar_url && (
          <p className="mt-4 text-xs font-semibold text-gray-400">
            {lang === 'zh' ? '此用户目前使用系统默认头像。' : 'This user is using the default system avatar.'}
          </p>
        )}
      </div>
    </div>
  )
}
