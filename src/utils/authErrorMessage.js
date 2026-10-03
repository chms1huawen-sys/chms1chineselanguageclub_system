export function authErrorMessage(error, lang = 'zh') {
  const zh = lang === 'zh'
  if (error?.code === 'invalid_credentials' || error?.message === 'Invalid login credentials') {
    return zh ? '邮箱或密码不正确，请重新输入。' : 'Incorrect email or password. Please try again.'
  }
  if (error?.status === 429 || ['over_request_rate_limit', 'over_email_send_rate_limit'].includes(error?.code)) {
    return zh ? '尝试次数过多，请稍后再试。' : 'Too many attempts. Please try again later.'
  }
  return zh ? '暂时无法登录，请检查网络后重试；若持续发生，请联系管理员。' : 'Unable to sign in. Check your connection and retry; contact an administrator if this continues.'
}
