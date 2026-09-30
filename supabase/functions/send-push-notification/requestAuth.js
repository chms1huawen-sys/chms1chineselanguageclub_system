export async function authorizePushRequest(client, jwt, serviceKey) {
  if (jwt && jwt === serviceKey) return 200
  if (!jwt) return 401
  const { data, error } = await client.auth.getUser(jwt)
  if (error || !data?.user?.id) return 401
  const profile = await client.from('users').select('is_active').eq('id', data.user.id).single()
  return !profile.error && profile.data?.is_active === true ? 200 : 403
}
