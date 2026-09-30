export async function savedTaskDelivery(send) {
  try {
    const results = await send()
    const deliveries = Array.isArray(results) ? results : [results]
    return !deliveries.some(result => Number(result?.push_failed || 0) > 0)
  } catch {
    // Saving and delivering are separate outcomes; a saved task must not be recreated.
    return false
  }
}
