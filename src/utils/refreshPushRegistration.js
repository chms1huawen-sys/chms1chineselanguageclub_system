import { supabase } from '../supabaseClient'
import { requestFcmToken } from '../firebase'
import { getDeviceKey, getDevicePlatform } from './pushDevice'

export async function refreshPushRegistration(userId, isCurrent = () => true) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const previous = localStorage.getItem('clc_fcm_token')
  if (!previous) return
  // A browser shared by two accounts must not silently transfer the first account's subscription.
  const { data: subscription, error } = await supabase.from('push_subscriptions')
    .select('id').eq('user_id', userId).eq('fcm_token', previous).maybeSingle()
  if (error) throw error
  if (!subscription || !isCurrent()) return
  const token = await requestFcmToken()
  if (!token || !isCurrent()) return
  const { data } = await supabase.auth.getSession()
  if (data.session?.user.id !== userId || !isCurrent()) return
  const { error: saveError } = await supabase.rpc('update_my_notification_settings', {
    p_fcm_token: token, p_notification_enabled: true,
    p_device_key: getDeviceKey(), p_platform: getDevicePlatform(),
  })
  if (saveError) throw saveError
  if (isCurrent()) localStorage.setItem('clc_fcm_token', token)
}
