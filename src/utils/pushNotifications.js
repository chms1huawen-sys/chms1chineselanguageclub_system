import { supabase } from '../supabaseClient'

const HASH_ROUTE_MAP = {
  '/tasks': '/#/tasks',
  '/calendar': '/#/calendar',
  '/leave': '/#/leave',
  '/members': '/#/members',
  '/settings': '/#/settings',
  '/dashboard': '/#/dashboard',
}

const normalizeNotificationUrl = (url = '/') => {
  if (!url || url === '/') return '/'
  if (url.startsWith('http')) return url
  if (url.startsWith('/#/')) return url
  return HASH_ROUTE_MAP[url] || url
}

export const sendPushForNotifications = async (notificationIds, url = '/') => {
  const ids = [...new Set((notificationIds || []).filter(Boolean))]
  if (ids.length === 0) return

  const { data, error } = await supabase.functions.invoke('send-push-notification', {
    body: {
      notification_ids: ids,
      url: normalizeNotificationUrl(url),
    },
  })

  if (error) {
    console.error('Send push notification failed:', error.message)
    throw error
  }

  return data
}

export const createNotificationsAndPush = async (notifications, url = '/') => {
  const rows = (notifications || []).filter(Boolean)
  if (rows.length === 0) return

  const { data, error } = await supabase.functions.invoke('send-push-notification', {
    body: {
      notifications: rows,
      url: normalizeNotificationUrl(url),
    },
  })

  if (error) {
    console.error('Create notifications and push failed:', error.message)
    throw error
  }

  return data
}

export const syncAnnouncementNotifications = async ({ action, announcementId, title, body, recipientIds }) => {
  if (!action || !announcementId) return

  const { data, error } = await supabase.functions.invoke('send-push-notification', {
    body: {
      announcement_sync: {
        action,
        announcement_id: announcementId,
        title,
        body,
        recipient_ids: recipientIds || [],
      },
    },
  })

  if (error) {
    console.error('Sync announcement notifications failed:', error.message)
    throw error
  }

  return data
}
