import { initializeApp } from 'firebase/app'
import { getMessaging, getToken, isSupported, onMessage } from 'firebase/messaging'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)

export const getFirebaseMessaging = async () => {
  const supported = await isSupported()
  return supported ? getMessaging(app) : null
}

export const requestFcmToken = async () => {
  const messaging = await getFirebaseMessaging()
  if (!messaging) throw new Error('此浏览器不支持 Firebase 推送通知。')

  const registration = await navigator.serviceWorker.ready
  return getToken(messaging, {
    vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  })
}

export const listenForegroundMessages = async (callback) => {
  const messaging = await getFirebaseMessaging()
  if (!messaging) return () => {}
  return onMessage(messaging, callback)
}
