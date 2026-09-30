export function isInvalidFcmTokenError(message) {
  try {
    const body = JSON.parse(message)
    return body.error?.details?.some(detail =>
      detail['@type'] === 'type.googleapis.com/google.firebase.fcm.v1.FcmError'
      && detail.errorCode === 'UNREGISTERED',
    ) === true
  } catch {
    return false
  }
}
