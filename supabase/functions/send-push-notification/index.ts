import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

type ServiceAccount = {
  client_email: string
  private_key: string
  project_id?: string
}

type NotificationRow = {
  id: string
  user_id: string
  type: string
  title: string
  body: string
  dedupe_key: string | null
}

type NotificationInput = {
  user_id: string
  type: string
  title: string
  body: string
  dedupe_key?: string | null
}

type UserPushSetting = {
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

type AnnouncementSyncInput = {
  action: 'update' | 'delete'
  announcement_id: string
  title?: string
  body?: string
  recipient_ids?: string[]
}

const announcementManagerRoles = ['convener_teacher', 'advisor_teacher', 'chairperson']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

const getJwtSubject = (jwt: string) => {
  const payload = jwt.split('.')[1]
  if (!payload) return null

  try {
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const decoded = JSON.parse(atob(padded))
    return typeof decoded.sub === 'string' && decoded.sub ? decoded.sub : null
  } catch {
    return null
  }
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
  notification: NotificationRow,
  url: string,
  linkUrl: string,
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
          dedupe_key: notification.dedupe_key || '',
          url,
        },
        webpush: {
          fcm_options: { link: linkUrl },
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

Deno.serve(async (request) => {
  console.log('[send-push-notification] request received', {
    method: request.method,
    origin: request.headers.get('origin'),
  })

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers: corsHeaders })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const announcementSync = body.announcement_sync as AnnouncementSyncInput | undefined
    let notificationIds = Array.isArray(body.notification_ids)
      ? [...new Set(body.notification_ids)].filter(Boolean)
      : []
    const notificationRows = Array.isArray(body.notifications)
      ? (body.notifications as NotificationInput[]).filter((item) => item?.user_id && item?.type && item?.title && item?.body)
      : []
    const url = typeof body.url === 'string' && body.url ? body.url : '/'
    const origin = request.headers.get('origin') || Deno.env.get('SITE_URL') || Deno.env.get('APP_URL') || ''
    const linkUrl = url.startsWith('http')
      ? url
      : origin
        ? new URL(url, origin).toString()
        : url

    if (!announcementSync && notificationIds.length === 0 && notificationRows.length === 0) {
      return new Response(JSON.stringify({ error: 'notification_ids or notifications is required.' }), { status: 400, headers: corsHeaders })
    }

    console.log('[send-push-notification] payload parsed', {
      notification_ids: notificationIds.length,
      notification_rows: notificationRows.length,
      url,
      linkUrl,
    })

    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!serviceRoleKey) {
      return new Response(JSON.stringify({ error: 'Missing SERVICE_ROLE_KEY secret.' }), { status: 500, headers: corsHeaders })
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, serviceRoleKey)

    if (announcementSync) {
      const authHeader = request.headers.get('Authorization') || ''
      const requesterJwt = authHeader.replace(/^Bearer\s+/i, '').trim()
      if (!requesterJwt) {
        return new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401, headers: corsHeaders })
      }

      const requesterId = getJwtSubject(requesterJwt)
      if (!requesterId) {
        return new Response(JSON.stringify({ error: 'Unauthorized.' }), { status: 401, headers: corsHeaders })
      }

      const { data: requesterProfile, error: requesterProfileError } = await supabase
        .from('users')
        .select('role')
        .eq('id', requesterId)
        .single()

      if (requesterProfileError || !announcementManagerRoles.includes(requesterProfile?.role)) {
        return new Response(JSON.stringify({ error: 'Forbidden.' }), { status: 403, headers: corsHeaders })
      }

      const announcementId = announcementSync.announcement_id
      const dedupePattern = `announcement-${announcementId}-%`

      if (!announcementId) {
        return new Response(JSON.stringify({ error: 'announcement_id is required.' }), { status: 400, headers: corsHeaders })
      }

      if (announcementSync.action === 'delete') {
        const { error: deleteError } = await supabase
          .from('notifications')
          .delete()
          .eq('type', 'announcement')
          .like('dedupe_key', dedupePattern)

        if (deleteError) {
          console.error('[send-push-notification] delete announcement notifications failed', deleteError.message)
          return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: corsHeaders })
        }

        return new Response(JSON.stringify({ message: 'Announcement notifications deleted.' }), { status: 200, headers: corsHeaders })
      }

      if (announcementSync.action === 'update') {
        const recipientIds = [...new Set(announcementSync.recipient_ids || [])].filter(Boolean)
        const title = announcementSync.title || ''
        const notificationBody = announcementSync.body || ''

        if (!title || !notificationBody) {
          return new Response(JSON.stringify({ error: 'title and body are required.' }), { status: 400, headers: corsHeaders })
        }

        const { error: deleteError } = await supabase
          .from('notifications')
          .delete()
          .eq('type', 'announcement')
          .like('dedupe_key', dedupePattern)

        if (deleteError) {
          console.error('[send-push-notification] replace announcement notifications failed', deleteError.message)
          return new Response(JSON.stringify({ error: deleteError.message }), { status: 500, headers: corsHeaders })
        }

        if (recipientIds.length === 0) {
          return new Response(JSON.stringify({ message: 'Announcement notifications cleared.', notifications: 0 }), { status: 200, headers: corsHeaders })
        }

        const rows = recipientIds.map((userId) => ({
          user_id: userId,
          type: 'announcement',
          title,
          body: notificationBody,
          dedupe_key: `announcement-${announcementId}-${userId}`,
        }))

        const { error: insertError } = await supabase
          .from('notifications')
          .insert(rows)

        if (insertError) {
          console.error('[send-push-notification] recreate announcement notifications failed', insertError.message)
          return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: corsHeaders })
        }

        return new Response(JSON.stringify({ message: 'Announcement notifications updated.', notifications: rows.length }), { status: 200, headers: corsHeaders })
      }

      return new Response(JSON.stringify({ error: 'Invalid announcement sync action.' }), { status: 400, headers: corsHeaders })
    }

    if (notificationRows.length > 0) {
      const { data: insertedNotifications, error: insertError } = await supabase
        .from('notifications')
        .upsert(notificationRows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
        .select('id')

      if (insertError) {
        console.error('[send-push-notification] insert notifications failed', insertError.message)
        return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: corsHeaders })
      }

      notificationIds = [
        ...notificationIds,
        ...(insertedNotifications || []).map((item) => item.id),
      ]

      console.log('[send-push-notification] notifications inserted', {
        inserted: insertedNotifications?.length || 0,
        notification_ids: notificationIds.length,
      })
    }

    const serviceAccountText = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
    if (!serviceAccountText) {
      return new Response(JSON.stringify({ error: 'Missing FIREBASE_SERVICE_ACCOUNT secret.' }), { status: 500, headers: corsHeaders })
    }

    const serviceAccount = JSON.parse(serviceAccountText) as ServiceAccount
    const firebaseProjectId = Deno.env.get('FIREBASE_PROJECT_ID') || serviceAccount.project_id
    if (!firebaseProjectId) {
      return new Response(JSON.stringify({ error: 'Missing FIREBASE_PROJECT_ID secret.' }), { status: 500, headers: corsHeaders })
    }

    const { data: notifications, error: notificationsError } = await supabase
      .from('notifications')
      .select('id, user_id, type, title, body, dedupe_key')
      .in('id', notificationIds)

    if (notificationsError) {
      console.error('[send-push-notification] fetch notifications failed', notificationsError.message)
      return new Response(JSON.stringify({ error: notificationsError.message }), { status: 500, headers: corsHeaders })
    }

    if (!notifications || notifications.length === 0) {
      console.log('[send-push-notification] no notifications found')
      return new Response(JSON.stringify({ message: 'No notifications found.', push_sent: 0 }), { status: 200, headers: corsHeaders })
    }

    const userIds = [...new Set(notifications.map((notification: NotificationRow) => notification.user_id))]
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, fcm_token, notification_enabled')
      .in('id', userIds)

    if (usersError) {
      console.error('[send-push-notification] fetch users failed', usersError.message)
      return new Response(JSON.stringify({ error: usersError.message }), { status: 500, headers: corsHeaders })
    }

    const { data: subscriptions, error: subscriptionsError } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, fcm_token, is_active')
      .in('user_id', userIds)
      .eq('is_active', true)

    if (subscriptionsError) {
      console.error('[send-push-notification] fetch push subscriptions failed', subscriptionsError.message)
      return new Response(JSON.stringify({ error: subscriptionsError.message }), { status: 500, headers: corsHeaders })
    }

    const usersById = new Map(((users || []) as UserPushSetting[]).map((user) => [user.id, user]))
    const subscriptionsByUserId = new Map<string, PushSubscriptionRow[]>()
    for (const subscription of ((subscriptions || []) as PushSubscriptionRow[])) {
      if (!subscriptionsByUserId.has(subscription.user_id)) subscriptionsByUserId.set(subscription.user_id, [])
      subscriptionsByUserId.get(subscription.user_id)!.push(subscription)
    }
    for (const user of ((users || []) as UserPushSetting[])) {
      if (user.fcm_token && !subscriptionsByUserId.has(user.id)) {
        subscriptionsByUserId.set(user.id, [{
          id: '',
          user_id: user.id,
          fcm_token: user.fcm_token,
          is_active: true,
        }])
      }
    }

    const tokenCount = [...subscriptionsByUserId.entries()]
      .filter(([userId]) => usersById.get(userId)?.notification_enabled)
      .reduce((sum, [, rows]) => sum + rows.length, 0)
    console.log('[send-push-notification] recipients loaded', {
      notifications: notifications.length,
      users: users?.length || 0,
      devices: subscriptions?.length || 0,
      push_ready_users: tokenCount,
    })

    const accessToken = await getFirebaseAccessToken(serviceAccount)

    const pushResults = await Promise.allSettled(
      (notifications as NotificationRow[]).flatMap((notification) => {
        const user = usersById.get(notification.user_id)
        const userSubscriptions = subscriptionsByUserId.get(notification.user_id) || []
        if (!user?.notification_enabled || userSubscriptions.length === 0) {
          return [Promise.resolve('skipped')]
        }

        return userSubscriptions.map(async (subscription) => {
          try {
            await sendFcmNotification(accessToken, firebaseProjectId, subscription.fcm_token, notification, url, linkUrl)
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

    console.log('[send-push-notification] push result', {
      push_sent: sentCount,
      push_skipped: skippedCount,
      push_failed: failed.length,
      push_errors: failed.slice(0, 3),
    })

    return new Response(JSON.stringify({
      message: `Push completed. Sent ${sentCount}.`,
      notifications: notifications.length,
      push_sent: sentCount,
      push_skipped: skippedCount,
      push_failed: failed.length,
      push_errors: failed.slice(0, 5),
    }), { status: 200, headers: corsHeaders })
  } catch (error) {
    console.error('[send-push-notification] unhandled error', error.message || String(error))
    return new Response(JSON.stringify({ error: error.message || String(error) }), { status: 500, headers: corsHeaders })
  }
})
