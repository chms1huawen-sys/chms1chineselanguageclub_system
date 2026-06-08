importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyDOwhUJaUH5IyFxwqbEZ5qN9l3eW7yN_9w',
  authDomain: 'chms1chineselanguageclub-sys.firebaseapp.com',
  projectId: 'chms1chineselanguageclub-sys',
  storageBucket: 'chms1chineselanguageclub-sys.firebasestorage.app',
  messagingSenderId: '723001669922',
  appId: '1:723001669922:web:5bb4fb800ac5f22b55cd7b',
})

const messaging = firebase.messaging()

const normalizeTargetUrl = (url = '/') => {
  if (!url || url === '/') return '/'
  if (url.startsWith('http')) return url
  if (url.startsWith('/#/')) return url

  const hashRoutes = {
    '/tasks': '/#/tasks',
    '/calendar': '/#/calendar',
    '/leave': '/#/leave',
    '/members': '/#/members',
    '/settings': '/#/settings',
  }

  return hashRoutes[url] || url
}

const showPushNotification = (payload = {}) => {
  const notification = payload.notification || {}
  const data = payload.data || {}
  const title = notification.title || data.title || payload.title || '一中华文学会系统'
  const options = {
    body: notification.body || data.body || payload.body || '你有一则新的系统通知。',
    icon: notification.icon || data.icon || '/logo-192.png',
    badge: '/logo-192.png',
    data: {
      url: data.url || '/',
      ...data,
    },
  }

  return self.registration.showNotification(title, options)
}

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw] Background message:', payload)
  return showPushNotification(payload)
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch (error) {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const isFirebaseMessage = Boolean(
    payload.from ||
    payload.fcmMessageId ||
    payload.messageId ||
    payload.notification ||
    payload.data?.['google.c.sender.id']
  )

  if (!isFirebaseMessage) {
    event.waitUntil(showPushNotification(payload))
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = normalizeTargetUrl(event.notification.data?.url || '/')

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl)
          return client.focus()
        }
      }
      return clients.openWindow(targetUrl)
    })
  )
})
