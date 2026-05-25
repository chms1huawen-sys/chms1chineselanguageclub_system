// supabase/functions/task-deadline-reminder/index.ts
// 部署方式：supabase functions deploy task-deadline-reminder
// 定时触发：Supabase Dashboard > Edge Functions > Schedules

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ServiceAccount = {
  client_email: string
  private_key: string
  project_id?: string
}

type ReminderNotification = {
  user_id: string
  type: string
  title: string
  body: string
  dedupe_key: string
}

const textEncoder = new TextEncoder()

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
          url: '/',
        },
        webpush: {
          fcm_options: { link: '/' },
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

Deno.serve(async () => {
  const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!serviceRoleKey) {
    return new Response(JSON.stringify({ error: 'Missing SERVICE_ROLE_KEY secret.' }), { status: 500 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    serviceRoleKey,
  )

  const serviceAccountText = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
  if (!serviceAccountText) {
    return new Response(JSON.stringify({ error: 'Missing FIREBASE_SERVICE_ACCOUNT secret.' }), { status: 500 })
  }

  const serviceAccount = JSON.parse(serviceAccountText) as ServiceAccount
  const firebaseProjectId = Deno.env.get('FIREBASE_PROJECT_ID') || serviceAccount.project_id
  if (!firebaseProjectId) {
    return new Response(JSON.stringify({ error: 'Missing FIREBASE_PROJECT_ID secret.' }), { status: 500 })
  }

  // 使用马来西亚标准时间 (UTC+8) 计算日期，避免 UTC 日期边界偏差。
  const now = new Date()
  const malaysiaOffset = 8 * 60 * 60 * 1000
  const localTime = new Date(now.getTime() + malaysiaOffset)
  const todayStr = localTime.toISOString().split('T')[0]
  const tomorrowTime = new Date(localTime.getTime() + (24 * 60 * 60 * 1000))
  const tomorrowStr = tomorrowTime.toISOString().split('T')[0]

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, due_date, assigned_to')
    .in('status', ['pending', 'in_progress'])
    .gte('due_date', `${todayStr}T00:00:00Z`)
    .lte('due_date', `${tomorrowStr}T23:59:59Z`)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!tasks?.length) {
    return new Response(JSON.stringify({ message: '没有即将截止的任务' }), { status: 200 })
  }

  const notifications: ReminderNotification[] = []

  for (const task of tasks) {
    if (!task.due_date) continue

    const taskDueDateLocal = new Date(new Date(task.due_date).getTime() + malaysiaOffset)
    const taskDueDateStr = taskDueDateLocal.toISOString().split('T')[0]
    const isToday = taskDueDateStr === todayStr
    const isTomorrow = taskDueDateStr === tomorrowStr

    if (!isToday && !isTomorrow) continue

    const assignedUsers = Array.isArray(task.assigned_to) ? task.assigned_to : [task.assigned_to]

    for (const userId of assignedUsers) {
      if (!userId) continue

      const actionType = isToday ? 'deadline_today' : 'deadline_tomorrow'
      const dedupeKey = `${userId}-${task.id}-${actionType}-${todayStr}`

      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('dedupe_key', dedupeKey)
        .maybeSingle()

      if (existing) continue

      notifications.push({
        user_id: userId,
        type: actionType,
        title: isToday ? '⚠️ 任务今天截止！' : '📅 任务明天截止',
        body: isToday
          ? `「${task.title}」今天到期，请尽快完成。`
          : `「${task.title}」明天到期，请尽快完成。`,
        dedupe_key: dedupeKey,
      })
    }
  }

  if (notifications.length === 0) {
    return new Response(JSON.stringify({ message: '无需发送新提醒' }), { status: 200 })
  }

  const { error: insertError } = await supabase
    .from('notifications')
    .insert(notifications)

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 })
  }

  const userIds = [...new Set(notifications.map((notification) => notification.user_id))]
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
    notifications.map(async (notification) => {
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
      message: `成功建立 ${notifications.length} 条截止提醒，手机推送 ${sentCount} 条。`,
      in_app_notifications: notifications.length,
      push_sent: sentCount,
      push_skipped: skippedCount,
      push_failed: failed.length,
      push_errors: failed.slice(0, 5),
    }),
    { status: failed.length ? 207 : 200 },
  )
})
