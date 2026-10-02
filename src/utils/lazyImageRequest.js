export function requestWhenVisible(element, request, Observer = globalThis.IntersectionObserver) {
  if (!element || !Observer) {
    request()
    return () => {}
  }
  let started = false
  const observer = new Observer(entries => {
    if (!started && entries.some(entry => entry.isIntersecting)) {
      started = true
      observer.disconnect()
      request()
    }
  }, { rootMargin: '200px' })
  observer.observe(element)
  return () => { started = true; observer.disconnect() }
}
