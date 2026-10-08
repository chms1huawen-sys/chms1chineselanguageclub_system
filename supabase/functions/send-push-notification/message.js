export function buildFcmMessage(notification, token, url, linkUrl) {
  return {
    message: {
      token,
      notification: { title: notification.title, body: notification.body },
      data: {
        type: notification.type,
        notification_id: notification.id,
        dedupe_key: notification.dedupe_key || '',
        url,
      },
      webpush: {
        // Task conversations are time-sensitive, visible notifications.
        ...(notification.type === 'task_commented' ? { headers: { Urgency: 'high' } } : {}),
        fcm_options: { link: linkUrl },
        notification: {
          icon: '/logo-192.png',
          badge: '/logo-192.png',
          tag: notification.id,
        },
      },
    },
  }
}
