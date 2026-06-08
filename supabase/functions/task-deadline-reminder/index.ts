// supabase/functions/task-deadline-reminder/index.ts
// 部署方式：supabase functions deploy task-deadline-reminder
// 建议定时：每天至少一次，最好每小时一次；函数会用 task_reminder_logs 防止同一天重复提醒。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ServiceAccount = {
  client_email: string
  private_key: string
  project_id?: string
}

type Task = {
  id: string
  title: string
  due_date: string | null
  assigned_to: string[] | string | null
  priority: 'high' | 'medium' | 'low' | null
  status: 'pending' | 'in_progress' | 'completed' | 'need_help'
  created_at: string
}

type ReminderDecision = {
  type: string
  title: string
  body: string
  reminder_key: string
}

type ReminderNotification = {
  user_id: string
  type: string
  title: string
  body: string
  dedupe_key: string
}

type ReminderLog = {
  task_id: string
  user_id: string
  reminder_key: string
}

const textEncoder = new TextEncoder()
const DAY_MS = 24 * 60 * 60 * 1000
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000
const TASKS_ROUTE = '/#/tasks'

const buildAppUrl = (route: string) => {
  const siteUrl = Deno.env.get('SITE_URL') || Deno.env.get('APP_URL') || ''
  if (!siteUrl) return route
  return `${siteUrl.replace(/\/+$/, '')}${route}`
}

const base64UrlEncode = (input: string | Uint8Array) => {
  const bytes = typeof input === 'string' ? textEncoder.encode(input) : input
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

const importPrivateKey = async (pem: string) => {
  const cleanPem = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')
  const binary = atob(cleanPem)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  return crypto.subtle.importKey(
    'pkcs8',
    bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )
}

const getFirebaseAccessToken = async (serviceAccount: ServiceAccount) => {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  }

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`
  const privateKey = await importPrivateKey(serviceAccount.private_key)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    privateKey,
    textEncoder.encode(unsignedJwt),
  )
  const jwt = `${unsignedJwt}.${base64UrlEncode(new Uint8Array(signature))}`

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })

  const tokenData = await response.json()
  if (!response.ok) {
    throw new Error(tokenData.error_description || tokenData.error || 'Failed to get Firebase access token.')
  }

  return tokenData.access_token as string
}

const sendFcmNotification = async (
  accessToken: string,
  projectId: string,
  fcmToken: string,
  notification: ReminderNotification,
) => {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: {
          type: notification.type,
          dedupe_key: notification.dedupe_key,
          url: TASKS_ROUTE,
        },
        webpush: {
          fcm_options: { link: buildAppUrl(TASKS_ROUTE) },
          notification: {
            icon: '/logo-192.png',
            badge: '/logo-192.png',
          },
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || `FCM send failed with ${response.status}`)
  }
}

const localDateKey = (date: Date) => new Date(date.getTime() + MALAYSIA_OFFSET_MS).toISOString().split('T')[0]

const daysBetweenLocalDates = (fromDateKey: string, toDateKey: string) => {
  const from = new Date(`${fromDateKey}T00:00:00+08:00`).getTime()
  const to = new Date(`${toDateKey}T00:00:00+08:00`).getTime()
  return Math.round((to - from) / DAY_MS)
}

const formatDueDate = (dueDate: string | null) => {
  if (!dueDate) return '未设置截止日期'
  return new Date(dueDate).toLocaleString('zh-CN', {
    timeZone: 'Asia/Kuala_Lumpur',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getAssignedUsers = (assignedTo: Task['assigned_to']) => {
  if (!assignedTo) return []
  return [...new Set(Array.isArray(assignedTo) ? assignedTo : [assignedTo])].filter(Boolean)
}

const getReminderDecision = (task: Task, todayKey: string): ReminderDecision | null => {
  if (task.status === 'completed') return null
  if (!task.due_date) return null

  const priority = task.priority || 'medium'
  const dueKey = localDateKey(new Date(task.due_date))
  const createdKey = localDateKey(new Date(task.created_at))
  const daysLeft = daysBetweenLocalDates(todayKey, dueKey)
  const daysSinceCreated = daysBetweenLocalDates(createdKey, todayKey)
  const dueText = formatDueDate(task.due_date)

  if (daysLeft < 0) {
    return {
      type: 'task_overdue_daily',
      title: `任务已逾期：${task.title}`,
      body: `「${task.title}」已逾期，截止时间：${dueText}。请今天处理或更新进度。`,
      reminder_key: `overdue-${todayKey}`,
    }
  }

  if (task.status === 'pending' && daysSinceCreated >= 3) {
    return {
      type: 'task_pending_daily',
      title: `任务还未开始：${task.title}`,
      body: `「${task.title}」已经分配超过 3 天，状态仍是待开始。截止时间：${dueText}。`,
      reminder_key: `pending-3days-${todayKey}`,
    }
  }

  if (priority === 'high') {
    if (task.status === 'pending' && daysLeft <= 3 && daysLeft >= 0) {
      return {
        type: 'task_high_final_daily',
        title: `高优先级任务需要马上开始：${task.title}`,
        body: `「${task.title}」距离截止只剩 ${daysLeft} 天，状态仍是待开始。截止时间：${dueText}。`,
        reminder_key: `high-final-${todayKey}`,
      }
    }

    if (daysLeft >= 4 && daysLeft <= 14 && (14 - daysLeft) % 3 === 0) {
      return {
        type: 'task_high_cycle',
        title: `高优先级任务提醒：${task.title}`,
        body: `「${task.title}」距离截止还有 ${daysLeft} 天。截止时间：${dueText}。`,
        reminder_key: `high-cycle-${todayKey}`,
      }
    }
  }

  if (priority === 'medium' && [7, 4, 1].includes(daysLeft)) {
    return {
      type: 'task_medium_checkpoint',
      title: `中优先级任务提醒：${task.title}`,
      body: `「${task.title}」距离截止还有 ${daysLeft} 天。截止时间：${dueText}。`,
      reminder_key: `medium-${daysLeft}d-${todayKey}`,
    }
  }

  if (priority === 'low' && [1, 0].includes(daysLeft)) {
    return {
      type: daysLeft === 0 ? 'task_low_due_today' : 'task_low_due_tomorrow',
      title: daysLeft === 0 ? `低优先级任务今天截止：${task.title}` : `低优先级任务明天截止：${task.title}`,
      body: `「${task.title}」截止时间：${dueText}。`,
      reminder_key: `low-${daysLeft}d-${todayKey}`,
    }
  }

  return null
}

Deno.serve(async (request) => {
  console.log('[task-deadline-reminder] request received', {
    method: request.method,
    now: new Date().toISOString(),
  })

  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceRoleKey) {
    console.error('[task-deadline-reminder] missing SERVICE_ROLE_KEY')
    return new Response(JSON.stringify({ error: 'Missing SERVICE_ROLE_KEY secret.' }), { status: 500 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  )

  const serviceAccountText = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
  if (!serviceAccountText) {
    console.error('[task-deadline-reminder] missing FIREBASE_SERVICE_ACCOUNT')
    return new Response(JSON.stringify({ error: 'Missing FIREBASE_SERVICE_ACCOUNT secret.' }), { status: 500 })
  }

  const serviceAccount = JSON.parse(serviceAccountText) as ServiceAccount
  const firebaseProjectId = Deno.env.get('FIREBASE_PROJECT_ID') || serviceAccount.project_id
  if (!firebaseProjectId) {
    console.error('[task-deadline-reminder] missing FIREBASE_PROJECT_ID')
    return new Response(JSON.stringify({ error: 'Missing FIREBASE_PROJECT_ID secret.' }), { status: 500 })
  }

  const todayKey = localDateKey(new Date())
  console.log('[task-deadline-reminder] running rules', { todayKey })

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, due_date, assigned_to, priority, status, created_at')
    .neq('status', 'completed')
    .not('due_date', 'is', null)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const notifications: ReminderNotification[] = []
  const logs: ReminderLog[] = []

  for (const task of (tasks || []) as Task[]) {
    const decision = getReminderDecision(task, todayKey)
    if (!decision) continue

    for (const userId of getAssignedUsers(task.assigned_to)) {
      const reminderKey = `${decision.reminder_key}-${userId}`
      const dedupeKey = `task-${task.id}-${reminderKey}`
      notifications.push({
        user_id: userId,
        type: decision.type,
        title: decision.title,
        body: decision.body,
        dedupe_key: dedupeKey,
      })
      logs.push({
        task_id: task.id,
        user_id: userId,
        reminder_key: reminderKey,
      })
    }
  }

  if (notifications.length === 0) {
    return new Response(JSON.stringify({ message: '今天没有符合规则的任务提醒。' }), { status: 200 })
  }

  const { data: insertedLogs, error: logError } = await supabase
    .from('task_reminder_logs')
    .upsert(logs, { onConflict: 'task_id,user_id,reminder_key', ignoreDuplicates: true })
    .select('task_id, user_id, reminder_key')

  if (logError) {
    return new Response(JSON.stringify({ error: logError.message }), { status: 500 })
  }

  const allowedKeys = new Set(
    (insertedLogs || []).map((log) => `task-${log.task_id}-${log.reminder_key}`),
  )
  const freshNotifications = notifications.filter((notification) => allowedKeys.has(notification.dedupe_key))

  if (freshNotifications.length === 0) {
    return new Response(JSON.stringify({ message: '今天的任务提醒已经发送过。' }), { status: 200 })
  }

  const { error: insertError } = await supabase
    .from('notifications')
    .upsert(freshNotifications, { onConflict: 'dedupe_key', ignoreDuplicates: true })

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 })
  }

  const userIds = [...new Set(freshNotifications.map((notification) => notification.user_id))]
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, fcm_token, notification_enabled')
    .in('id', userIds)

  if (usersError) {
    return new Response(JSON.stringify({ error: usersError.message }), { status: 500 })
  }

  const usersById = new Map((users || []).map((user) => [user.id, user]))
  const accessToken = await getFirebaseAccessToken(serviceAccount)
  const pushResults = await Promise.allSettled(
    freshNotifications.map(async (notification) => {
      const user = usersById.get(notification.user_id)
      if (!user?.notification_enabled || !user.fcm_token) return 'skipped'
      await sendFcmNotification(accessToken, firebaseProjectId, user.fcm_token, notification)
      return 'sent'
    }),
  )

  const sentCount = pushResults.filter((result) => result.status === 'fulfilled' && result.value === 'sent').length
  const skippedCount = pushResults.filter((result) => result.status === 'fulfilled' && result.value === 'skipped').length
  const failed = pushResults
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason?.message || String(result.reason))

  return new Response(
    JSON.stringify({
      message: `成功建立 ${freshNotifications.length} 条任务提醒，手机推送 ${sentCount} 条。`,
      in_app_notifications: freshNotifications.length,
      push_sent: sentCount,
      push_skipped: skippedCount,
      push_failed: failed.length,
      push_errors: failed.slice(0, 5),
    }),
    { status: failed.length ? 207 : 200 },
  )
})
