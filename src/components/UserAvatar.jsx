import React from 'react'

export default function UserAvatar({
  user,
  name,
  size = 36,
  rounded = 14,
  className = '',
  onClick,
  title,
}) {
  const displayName = name || user?.name || 'Member'
  const avatarUrl = user?.avatar_url
  const initials = displayName.slice(0, 2)
  const interactive = typeof onClick === 'function'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      title={title || displayName}
      className={`inline-flex items-center justify-center overflow-hidden shrink-0 font-black ${interactive ? 'cursor-pointer hover:scale-105 transition' : 'cursor-default'} ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: rounded,
        background: 'linear-gradient(135deg, #95CBFF 0%, #FFB3C6 100%)',
        color: 'white',
        border: '1.5px solid rgba(255,255,255,0.8)',
        boxShadow: '0 4px 14px rgba(149,203,255,0.25)',
        fontSize: Math.max(10, Math.round(size * 0.32)),
        textShadow: '0 1px 4px rgba(40,96,150,0.35)',
      }}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
      ) : (
        initials
      )}
    </button>
  )
}
