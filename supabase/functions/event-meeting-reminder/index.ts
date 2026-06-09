// supabase/functions/event-meeting-reminder/index.ts
// Deploy: supabase functions deploy event-meeting-reminder
// Schedule: run hourly or daily. Notification dedupe keys prevent repeated reminders.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ServiceAccount = {
  client_email: string
  private_key: string
  project_id?: string
}

type CalendarEvent = {
  id: string
  title: string
  date: string
  type: 'event' | 'meeting'
  color: 'blue' | 'green'
}

type UserRow = {
  id: string
  fcm_token: string | null
  notification_enabled: boolean
}

type PushSubscriptionRow = {
  id: string
  user_id: string
  fcm_token: string
  is_active: boolean
}

type ReminderNotification = {
  user_id: string
  type: string
  title: string
  body: string
  dedupe_key: string
}

type InsertedNotification = ReminderNotification & {
  id: string
}

const textEncoder = new TextEncoder()
const DAY_MS = 24 * 60 * 60 * 1000
const MALAYSIA_OFFSET_MS = 8 * 60 * 60 * 1000
const REMINDER_DAYS = [7, 3, 1]
const CALENDAR_ROUTE = '/#/calendar'

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

const localDateKey = (date: Date) => new Date(date.getTime() + MALAYSIA_OFFSET_MS).toISOString().split('T')[0]

const addDaysLocal = (dateKey: string, days: number) => {
  const timestamp = new Date(`${dateKey}T00:00:00+08:00`).getTime() + days * DAY_MS
  return localDateKey(new Date(timestamp))
}

const daysBetweenLocalDates = (fromDateKey: string, toDateKey: string) => {
  const from = new Date(`${fromDateKey}T00:00:00+08:00`).getTime()
  const to = new Date(`${toDateKey}T00:00:00+08:00`).getTime()
  return Math.round((to - from) / DAY_MS)
}

const formatEventDate = (dateKey: string) => new Date(`${dateKey}T00:00:00+08:00`).toLocaleDateString('zh-CN', {
  timeZone: 'Asia/Kuala_Lumpur',
  month: 'long',
  day: 'numeric',
  weekday: 'short',
})

const buildReminder = (event: CalendarEvent, daysLeft: number, userId: string): ReminderNotification => {
  const eventTypeText = event.type === 'meeting' ? '内部会议' : '学会活动'
  const dayText = daysLeft === 1 ? '明天' : `${daysLeft} 天后`
  const dateText = formatEventDate(event.date)

  return {
    user_id: userId,
    type: 'calendar_event_reminder',
    title: `${eventTypeText}提醒：${event.title}`,
    body: `「${event.title}」将在${dayText}举行，日期：${dateText}。`,
    dedupe_key: `calendar-${event.id}-${daysLeft}d-${userId}`,
  }
}

const sendFcmNotification = async (
  accessToken: string,
  projectId: string,
  fcmToken: string,
  notification: InsertedNotification,
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
          notification_id: notification.id,
          dedupe_key: notification.dedupe_key,
          url: CALENDAR_ROUTE,
        },
        webpush: {
          fcm_options: { link: buildAppUrl(CALENDAR_ROUTE) },
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

const isInvalidFcmTokenError = (message: string) =>
  /UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT|Requested entity was not found/i.test(message)

Deno.serve(async () => {
  try {
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing SERVICE_ROLE_KEY secret.' }), { status: 500 })
    }

    const serviceAccountText = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    if (!serviceAccountText) {
      return new Response(JSON.stringify({ error: 'Missing FIREBASE_SERVICE_ACCOUNT secret.' }), { status: 500 })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)
    const todayKey = localDateKey(new Date())
    const weekEndKey = addDaysLocal(todayKey, 7)

    const { data: events, error: eventsError } = await supabase
      .from('events')
      .select('id, title, date, type, color')
      .in('type', ['event', 'meeting'])
      .in('color', ['blue', 'green'])
      .neq('title', 'EXEC_DRIVE_LINK')
      .not('title', 'ilike', 'Google Drive%')
      .gte('date', todayKey)
      .lte('date', weekEndKey)
      .order('date', { ascending: true })

    if (eventsError) {
      return new Response(JSON.stringify({ error: eventsError.message }), { status: 500 })
    }

    const reminderEvents = ((events || []) as CalendarEvent[])
      .map((event) => ({ event, daysLeft: daysBetweenLocalDates(todayKey, event.date) }))
      .filter((item) => REMINDER_DAYS.includes(item.daysLeft))

    if (reminderEvents.length === 0) {
      return new Response(JSON.stringify({ message: '今天没有符合规则的活动或会议提醒。' }), { status: 200 })
    }

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, fcm_token, notification_enabled')
      .eq('is_active', true)

    if (usersError) {
      return new Response(JSON.stringify({ error: usersError.message }), { status: 500 })
    }

    const activeUsers = (users || []) as UserRow[]
    const notifications = reminderEvents.flatMap(({ event, daysLeft }) =>
      activeUsers.map((user) => buildReminder(event, daysLeft, user.id)),
    )

    const { data: insertedNotifications, error: insertError } = await supabase
      .from('notifications')
      .upsert(notifications, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('id, user_id, type, title, body, dedupe_key')

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500 })
    }

    const freshNotifications = (insertedNotifications || []) as InsertedNotification[]
    if (freshNotifications.length === 0) {
      return new Response(JSON.stringify({ message: '今天的活动或会议提醒已经发送过。' }), { status: 200 })
    }

    const usersById = new Map(activeUsers.map((user) => [user.id, user]))
    const userIds = activeUsers.map((user) => user.id)
    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, fcm_token, is_active')
      .in('user_id', userIds)
      .eq('is_active', true)

    if (subscriptionsError) {
      return new Response(JSON.stringify({ error: subscriptionsError.message }), { status: 500 })
    }

    const subscriptionsByUserId = new Map<string, PushSubscriptionRow[]>()
    for (const subscription of ((subscriptions || []) as PushSubscriptionRow[])) {
      if (!subscriptionsByUserId.has(subscription.user_id)) subscriptionsByUserId.set(subscription.user_id, [])
      subscriptionsByUserId.get(subscription.user_id)!.push(subscription)
    }
    for (const user of activeUsers) {
      if (user.fcm_token && !subscriptionsByUserId.has(user.id)) {
        subscriptionsByUserId.set(user.id, [{
          id: '',
          user_id: user.id,
          fcm_token: user.fcm_token,
          is_active: true,
        }])
      }
    }

    const serviceAccount = JSON.parse(serviceAccountText) as ServiceAccount
    const firebaseProjectId = Deno.env.get('FIREBASE_PROJECT_ID') || serviceAccount.project_id
    if (!firebaseProjectId) {
      return new Response(JSON.stringify({ error: 'Missing FIREBASE_PROJECT_ID secret.' }), { status: 500 })
    }

    const accessToken = await getFirebaseAccessToken(serviceAccount)
    const pushResults = await Promise.allSettled(
      freshNotifications.flatMap((notification) => {
        const user = usersById.get(notification.user_id)
        const userSubscriptions = subscriptionsByUserId.get(notification.user_id) || []
        if (!user?.notification_enabled || userSubscriptions.length === 0) {
          return [Promise.resolve('skipped')]
        }

        return userSubscriptions.map(async (subscription) => {
          try {
            await sendFcmNotification(accessToken, firebaseProjectId, subscription.fcm_token, notification)
            return 'sent'
          } catch (error) {
            const message = error.message || String(error)
            if (subscription.id && isInvalidFcmTokenError(message)) {
              await supabase
                .from('push_subscriptions')
                .update({ is_active: false })
                .eq('id', subscription.id)
            }
            throw error
          }
        })
      }),
    )

    const sentCount = pushResults.filter((result) => result.status === 'fulfilled' && result.value === 'sent').length
    const skippedCount = pushResults.filter((result) => result.status === 'fulfilled' && result.value === 'skipped').length
    const failed = pushResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason?.message || String(result.reason))

    return new Response(
      JSON.stringify({
        message: `成功建立 ${freshNotifications.length} 条活动/会议提醒，手机推送 ${sentCount} 条。`,
        matched_events: reminderEvents.length,
        in_app_notifications: freshNotifications.length,
        push_sent: sentCount,
        push_skipped: skippedCount,
        push_failed: failed.length,
        push_errors: failed.slice(0, 5),
      }),
      { status: failed.length ? 207 : 200 },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500 })
  }
})
