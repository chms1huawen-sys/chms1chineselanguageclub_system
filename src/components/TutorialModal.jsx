import React, { useState } from 'react'
import {
  X, ChevronRight, ChevronLeft, Smartphone, Monitor,
  CheckSquare, FolderGit, Shield, Bell, Camera
} from 'lucide-react'

const STEPS_ZH = [
  {
    icon: <Shield size={32} style={{ color: '#95CBFF' }} />,
    title: '欢迎使用一中华文学会系统',
    subtitle: '内部任务管理 & 活动协作平台',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-gray-600 font-semibold">
        <p>本系统专为华文学会干部团队设计，旨在解决任务分配后成员跟进不足的痛点。你只需要一个账号，即可：</p>
        <ul className="space-y-1.5 pl-3">
          <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">•</span> 查看和更新分配给你的所有任务进度</li>
          <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">•</span> 在任务下留言进展，与主席及干事沟通</li>
          <li className="flex items-start gap-2"><span className="text-pink-400 mt-0.5">•</span> 查看学会活动行事历，掌握即将到来的重要日期</li>
          <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span> 收到任务截止提醒（若已开启推送通知）</li>
        </ul>
      </div>
    )
  },
  {
    icon: <CheckSquare size={32} style={{ color: '#6366f1' }} />,
    title: '任务看板：你的工作中心',
    subtitle: '任务看板 — 你的工作中心',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-gray-600 font-semibold">
        <p>点击左边菜单栏的 <strong className="text-gray-800">「任务看板」</strong>，你会看到四个状态栏：</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: '待开始', color: '#eff6ff', text: '#3b82f6', desc: '刚分配，尚未开始' },
            { label: '进行中', color: '#eef2ff', text: '#6366f1', desc: '已着手处理' },
            { label: '需协助', color: '#fffbeb', text: '#f59e0b', desc: '遇困难，需帮助' },
            { label: '已完成', color: '#ecfdf5', text: '#10b981', desc: '任务顺利完成' },
          ].map(s => (
            <div key={s.label} className="p-2.5 rounded-xl" style={{ background: s.color, border: `1.5px solid ${s.text}30` }}>
              <span className="font-black text-xs block" style={{ color: s.text }}>{s.label}</span>
              <span className="text-gray-400 text-[10px] mt-0.5 block">{s.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500">点击任意任务卡片，即可在详情中<strong className="text-gray-700">更新状态</strong>或<strong className="text-gray-700">留下进展备注</strong>。</p>
      </div>
    )
  },
  {
    icon: <FolderGit size={32} style={{ color: '#10b981' }} />,
    title: '筹委团：多团队协作',
    subtitle: '筹委团 — 多团队协作',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-gray-600 font-semibold">
        <p>你可以同时是<strong className="text-gray-800">执委干部</strong>，又是<strong className="text-gray-800">某活动的筹委成员</strong>，只需一个账号。</p>
        <div className="p-4 rounded-2xl space-y-2" style={{ background: '#f0fdf4', border: '1.5px solid #a7f3d0' }}>
          <p className="text-xs font-black text-emerald-700">筹委团详情页功能：</p>
          <ul className="space-y-1 text-xs text-emerald-600">
            <li>→ 查看该活动的专属任务栏</li>
            <li>→ 点击 Google Drive 链接直达策划案文件夹</li>
            <li>→ 查看同一活动其他筹委成员的职位</li>
          </ul>
        </div>
        <p className="text-xs text-gray-500">主席可随时将你加入或移出特定筹委团，而不影响你在执委层的账号状态。</p>
      </div>
    )
  },
  {
    icon: <Camera size={32} style={{ color: '#FFB3C6' }} />,
    title: '个人设置：头像与推送注册',
    subtitle: '每台设备都需要独立开启推送',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-gray-600 font-semibold">
        <p>点击左边菜单栏的 <strong className="text-gray-800">「设置」</strong>，可以管理你的个人资料与通知状态。</p>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <div className="p-3 rounded-2xl" style={{ background: '#fff1f2', border: '1.5px solid #fecdd3' }}>
            <p className="font-black text-rose-600">个人头像</p>
            <p className="text-rose-500 mt-1">可上传 JPG、PNG 或 WEBP 头像；不上传时系统会使用默认首字头像。</p>
          </div>
          <div className="p-3 rounded-2xl" style={{ background: '#f0f7ff', border: '1.5px solid #bfdbfe' }}>
            <p className="font-black text-blue-600">推送通知</p>
            <p className="text-blue-500 mt-1">同一个账号可以登入多台设备，但每一台手机或电脑都要在设置里点击「重新注册推送通知」。</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">如果显示「需重新注册」，代表浏览器权限已允许，但这台设备还没有取得推送 Token。</p>
      </div>
    )
  },
  {
    icon: <Camera size={32} style={{ color: '#FFB3C6' }} />,
    title: 'Settings: Avatar & Push Registration',
    subtitle: 'Each device needs its own push registration',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-gray-600 font-semibold">
        <p>Open <strong className="text-gray-800">Settings</strong> from the sidebar to manage your profile and notification status.</p>
        <div className="grid grid-cols-1 gap-2 text-xs">
          <div className="p-3 rounded-2xl" style={{ background: '#fff1f2', border: '1.5px solid #fecdd3' }}>
            <p className="font-black text-rose-600">Profile Avatar</p>
            <p className="text-rose-500 mt-1">Upload a JPG, PNG, or WEBP avatar, or keep the default initials avatar.</p>
          </div>
          <div className="p-3 rounded-2xl" style={{ background: '#f0f7ff', border: '1.5px solid #bfdbfe' }}>
            <p className="font-black text-blue-600">Push Notifications</p>
            <p className="text-blue-500 mt-1">One account can be used on multiple devices, but each phone or computer must click "Refresh Push Registration" in Settings.</p>
          </div>
        </div>
        <p className="text-xs text-gray-500">If you see "Registration Needed", permission is allowed but this device has not received a push token yet.</p>
      </div>
    )
  },
  {
    icon: <Smartphone size={32} style={{ color: '#f59e0b' }} />,
    title: '手机推送通知 — iPhone (Safari)',
    subtitle: '在 iPhone 上开启推送通知',
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-gray-600 font-semibold">
        <div className="p-4 rounded-2xl text-xs space-y-2" style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}>
          <p className="font-black text-amber-700">⚠️ iPhone 用户请务必使用 Safari 浏览器！</p>
          <p className="text-amber-600">Chrome、Firefox 等第三方浏览器在 iOS 上不支持推送通知，请切换到 Safari。</p>
        </div>
        <div className="space-y-2.5">
          {[
            { step: '①', text: '在 Safari 中打开系统网址并登录' },
            { step: '②', text: '点击底部工具栏的「分享」按钮（方块+箭头图标）' },
            { step: '③', text: '在弹出菜单中选择「添加到主屏幕」' },
            { step: '④', text: '系统会以 App 图标形式保存到桌面，下次从桌面图标打开' },
            { step: '⑤', text: '从桌面图标打开系统，到「设置」点击「开启/重新注册推送通知」，并允许通知权限' },
          ].map(s => (
            <div key={s.step} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0"
                style={{ background: '#fef9c3', color: '#ca8a04', border: '1.5px solid #fde047' }}>
                {s.step}
              </span>
              <span className="text-xs text-gray-600 mt-0.5">{s.text}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    icon: <Monitor size={32} style={{ color: '#3b82f6' }} />,
    title: '手机推送通知 — Android & 电脑',
    subtitle: '在 Android 与电脑上开启推送通知',
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-gray-600 font-semibold">
        <div className="p-4 rounded-2xl text-xs space-y-2" style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe' }}>
          <p className="font-black text-blue-700">Android 手机 — 完全支持！</p>
          <p className="text-blue-600">使用 Chrome、Edge 等主流浏览器打开系统，浏览器会自动提示是否安装为 App 并开启通知，点击「允许」即可。</p>
        </div>
        <div className="space-y-2.5">
          <p className="font-black text-gray-700 text-xs">Android 安装为桌面 App：</p>
          {[
            { step: '①', text: '在 Chrome 打开系统网址并登录' },
            { step: '②', text: '点击地址栏右侧的「安装」按钮，或从菜单选择「添加到主屏幕」' },
            { step: '③', text: '安装后打开系统，到「设置」点击「开启/重新注册推送通知」，完成这台设备的注册' },
          ].map(s => (
            <div key={s.step} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0"
                style={{ background: '#eff6ff', color: '#3b82f6', border: '1.5px solid #bfdbfe' }}>
                {s.step}
              </span>
              <span className="text-xs text-gray-600 mt-0.5">{s.text}</span>
            </div>
          ))}
        </div>
        <div className="p-3.5 rounded-2xl text-xs" style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#065f46' }}>
          <strong>电脑浏览器：</strong> 系统通知会在屏幕右下角弹出，确保浏览器后台允许通知权限即可接收。
        </div>
      </div>
    )
  },
  {
    icon: <Bell size={32} style={{ color: '#10b981' }} />,
    title: '一切准备就绪！',
    subtitle: '一切准备就绪，开始使用吧！',
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-gray-600 font-semibold">
        <div className="p-4 rounded-2xl space-y-3" style={{ background: 'linear-gradient(135deg, #f0f7ff 0%, #f0fdf4 100%)', border: '1.5px solid #e0f1ff' }}>
          <p className="text-xs font-black text-gray-700">快速上手检查清单：</p>
          {[
            '✅ 确认自己的账号可以正常登录',
            '✅ 到设置上传头像，或保留系统默认头像',
            '✅ 在任务看板查看有没有分配给你的任务',
            '✅ 点击任务卡片，尝试更新一次状态或留下备注',
            '✅ 在每一台要收通知的设备完成 PWA 安装与推送注册',
            '✅ 查看活动行事历，了解近期学会安排',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
              <span>{item}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center">
          如有任何问题，请联系召集老师、指导老师、主席或副主席协助处理。祝使用愉快！
        </p>
      </div>
    )
  }
]

const STEPS_EN = [
  {
    icon: <Shield size={32} style={{ color: '#95CBFF' }} />,
    title: 'Welcome to CLC_sys',
    subtitle: 'Internal Task Management & Activity Collaboration Platform',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-gray-600 font-semibold">
        <p>CLC_sys is designed for committee members to manage tasks, activities and internal records with one account. You can:</p>
        <ul className="space-y-1.5 pl-3">
          <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">•</span> View and update all tasks assigned to you</li>
          <li className="flex items-start gap-2"><span className="text-green-400 mt-0.5">•</span> Leave comments and progress updates on any task</li>
          <li className="flex items-start gap-2"><span className="text-pink-400 mt-0.5">•</span> Check the event calendar for upcoming school activities</li>
          <li className="flex items-start gap-2"><span className="text-amber-400 mt-0.5">•</span> Receive push notifications for task deadlines (if enabled)</li>
        </ul>
      </div>
    )
  },
  {
    icon: <CheckSquare size={32} style={{ color: '#6366f1' }} />,
    title: 'Tasks Board: Your Work Hub',
    subtitle: 'Click on any task card to view details and update status',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-gray-600 font-semibold">
        <p>Click <strong className="text-gray-800">"Tasks Board"</strong> in the sidebar to see four status columns:</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: 'Pending', color: '#eff6ff', text: '#3b82f6', desc: 'Assigned, not started' },
            { label: 'In Progress', color: '#eef2ff', text: '#6366f1', desc: 'Currently working on' },
            { label: 'Need Help', color: '#fffbeb', text: '#f59e0b', desc: 'Stuck, needs assistance' },
            { label: 'Completed', color: '#ecfdf5', text: '#10b981', desc: 'Successfully done' },
          ].map(s => (
            <div key={s.label} className="p-2.5 rounded-xl" style={{ background: s.color, border: `1.5px solid ${s.text}30` }}>
              <span className="font-black text-xs block" style={{ color: s.text }}>{s.label}</span>
              <span className="text-gray-400 text-[10px] mt-0.5 block">{s.desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-500">Click any task card to <strong className="text-gray-700">update status</strong> or <strong className="text-gray-700">add a progress comment</strong>.</p>
      </div>
    )
  },
  {
    icon: <FolderGit size={32} style={{ color: '#10b981' }} />,
    title: 'Committees: Multi-team Collaboration',
    subtitle: 'One account — belong to multiple event committees',
    body: (
      <div className="space-y-3 text-sm leading-relaxed text-gray-600 font-semibold">
        <p>You can be a <strong className="text-gray-800">committee member</strong> and an <strong className="text-gray-800">event committee member</strong> simultaneously with one account.</p>
        <div className="p-4 rounded-2xl space-y-2" style={{ background: '#f0fdf4', border: '1.5px solid #a7f3d0' }}>
          <p className="text-xs font-black text-emerald-700">Committee Details Page includes:</p>
          <ul className="space-y-1 text-xs text-emerald-600">
            <li>→ Event-specific task board</li>
            <li>→ Direct Google Drive folder link access</li>
            <li>→ View all committee members and their roles</li>
          </ul>
        </div>
      </div>
    )
  },
  {
    icon: <Smartphone size={32} style={{ color: '#f59e0b' }} />,
    title: 'Push Notifications — iPhone (Safari)',
    subtitle: 'Must use Safari browser on iOS for notifications',
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-gray-600 font-semibold">
        <div className="p-4 rounded-2xl text-xs space-y-2" style={{ background: '#fffbeb', border: '1.5px solid #fde68a' }}>
          <p className="font-black text-amber-700">⚠️ iPhone users must use Safari browser!</p>
          <p className="text-amber-600">Chrome/Firefox on iOS do not support web push notifications. Please use Safari.</p>
        </div>
        <div className="space-y-2.5">
          {[
            { step: '①', text: 'Open the system URL in Safari and log in' },
            { step: '②', text: 'Tap the Share button (box with arrow) at the bottom toolbar' },
            { step: '③', text: 'Select "Add to Home Screen" from the menu' },
            { step: '④', text: 'The system saves as an App icon on your home screen' },
            { step: '⑤', text: 'Open from the home screen icon, go to Settings, tap "Enable/Refresh Push Registration", then allow notifications' },
          ].map(s => (
            <div key={s.step} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0"
                style={{ background: '#fef9c3', color: '#ca8a04', border: '1.5px solid #fde047' }}>
                {s.step}
              </span>
              <span className="text-xs text-gray-600 mt-0.5">{s.text}</span>
            </div>
          ))}
        </div>
      </div>
    )
  },
  {
    icon: <Monitor size={32} style={{ color: '#3b82f6' }} />,
    title: 'Push Notifications — Android & Desktop',
    subtitle: 'Full support on Android and desktop browsers',
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-gray-600 font-semibold">
        <div className="p-4 rounded-2xl text-xs space-y-2" style={{ background: '#eff6ff', border: '1.5px solid #bfdbfe' }}>
          <p className="font-black text-blue-700">Android — Fully Supported!</p>
          <p className="text-blue-600">Open in Chrome or Edge. The browser will prompt you to install as an App and enable notifications automatically.</p>
        </div>
        <div className="space-y-2.5">
          {[
            { step: '①', text: 'Open the system URL in Chrome on Android' },
            { step: '②', text: 'Tap "Install" button in address bar, or choose "Add to Home Screen" from the menu' },
            { step: '③', text: 'After installing, open Settings and tap "Enable/Refresh Push Registration" to register this device' },
          ].map(s => (
            <div key={s.step} className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs shrink-0"
                style={{ background: '#eff6ff', color: '#3b82f6', border: '1.5px solid #bfdbfe' }}>
                {s.step}
              </span>
              <span className="text-xs text-gray-600 mt-0.5">{s.text}</span>
            </div>
          ))}
        </div>
        <div className="p-3.5 rounded-2xl text-xs" style={{ background: '#ecfdf5', border: '1.5px solid #a7f3d0', color: '#065f46' }}>
          <strong>Desktop browsers:</strong> Notifications appear in the bottom-right corner. Ensure the browser allows site notifications.
        </div>
      </div>
    )
  },
  {
    icon: <Bell size={32} style={{ color: '#10b981' }} />,
    title: "You're all set — Let's go!",
    subtitle: '万事俱备，开始使用！',
    body: (
      <div className="space-y-4 text-sm leading-relaxed text-gray-600 font-semibold">
        <div className="p-4 rounded-2xl space-y-2" style={{ background: 'linear-gradient(135deg, #f0f7ff 0%, #f0fdf4 100%)', border: '1.5px solid #e0f1ff' }}>
          <p className="text-xs font-black text-gray-700">Quick Start Checklist:</p>
          {[
            '✅ Confirm you can log in with your account',
            '✅ Upload a profile avatar in Settings, or keep the default avatar',
            '✅ Check the Tasks Board for any tasks assigned to you',
            '✅ Click a task card and try updating its status',
            '✅ Complete PWA installation and push registration on every device that should receive notifications',
            '✅ Browse the Calendar to see upcoming activities',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-gray-600">
              <span>{item}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center">
          If you have any issues, please contact your convener teacher, advisor teacher, or president. Happy using!
        </p>
      </div>
    )
  }
]

export default function TutorialModal({ onClose, lang = 'zh' }) {
  const [step, setStep] = useState(0)
  const steps = lang === 'en' ? STEPS_EN : STEPS_ZH
  const total = steps.length
  const current = steps[step]

  const handleClose = () => {
    localStorage.setItem(`cls_tutorial_completed_${lang}`, '1')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)' }}>
      <div className="relative bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{ border: '1.5px solid #e0f1ff', boxShadow: '0 20px 60px rgba(149,203,255,0.25)' }}>

        {/* Top accent strip */}
        <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg, #95CBFF 0%, #FFB3C6 100%)' }} />

        {/* Step progress bar */}
        <div className="px-6 pt-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
              {lang === 'zh' ? `步骤 ${step + 1} / ${total}` : `Step ${step + 1} of ${total}`}
            </span>
            <button onClick={handleClose} className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition cursor-pointer">
              <X size={14} />
            </button>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <div key={i} className="h-1 flex-1 rounded-full transition-all duration-300"
                style={{ background: i <= step ? '#95CBFF' : '#e0f1ff' }} />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 overflow-y-auto flex-1">
          <div className="flex flex-col items-center text-center gap-3 mb-5">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
              {current.icon}
            </div>
            <div>
              <h2 className="font-black text-base text-gray-900 leading-snug">{current.title}</h2>
              <p className="text-xs font-semibold text-gray-400 mt-0.5">{current.subtitle}</p>
            </div>
          </div>

          <div className="text-left">
            {current.body}
          </div>
        </div>

        {/* Navigation footer */}
        <div className="px-6 py-4 flex items-center justify-between shrink-0"
          style={{ borderTop: '1.5px solid #f0f7ff' }}>
          <button
            onClick={() => setStep(s => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-black transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}
          >
            <ChevronLeft size={14} />
            {lang === 'zh' ? '上一步' : 'Back'}
          </button>

          {step < total - 1 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1.5 px-5 py-2 rounded-2xl text-xs font-black transition cursor-pointer text-white"
              style={{ background: '#95CBFF', boxShadow: '0 4px 14px rgba(149,203,255,0.4)' }}
            >
              {lang === 'zh' ? '下一步' : 'Next'}
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleClose}
              className="flex items-center gap-1.5 px-5 py-2 rounded-2xl text-xs font-black transition cursor-pointer text-white"
              style={{ background: 'linear-gradient(90deg, #95CBFF 0%, #6db8ff 100%)', boxShadow: '0 4px 14px rgba(149,203,255,0.4)' }}
            >
              {lang === 'zh' ? '开始使用 🎉' : "Let's Start 🎉"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
