export const getDeviceKey = () => {
  const existing = window.localStorage.getItem('clc_device_key')
  if (existing) return existing
  const key = crypto.randomUUID()
  window.localStorage.setItem('clc_device_key', key)
  return key
}

export const getDevicePlatform = () => {
  const ua = navigator.userAgent || ''
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  if (/windows/i.test(ua)) return 'windows'
  if (/macintosh|mac os/i.test(ua)) return 'macos'
  return 'desktop'
}
