export function withPushTimeout(promise, milliseconds = 15000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Push registration timed out. Please check your connection and try again.')), milliseconds)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export async function showForegroundPush(payload, registration) {
  const notification = payload.notification || {}
  const data = payload.data || {}
  await registration.showNotification(notification.title || data.title || '一中华文学会系统', {
    body: notification.body || data.body || '你有一则新的系统通知。',
    icon: '/logo-192.png',
    badge: '/logo-192.png',
    ...(data.notification_id ? { tag: data.notification_id } : {}),
    data: { ...data, url: data.url || '/member#/' },
  })
}
