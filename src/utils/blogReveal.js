export function observeBlogReveals(root) {
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (preference.matches || !window.IntersectionObserver) return () => {}
  const animations = new Set()
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      observer.unobserve(entry.target)
      entry.target.dataset.blogRevealed = 'true'
      if (preference.matches || !entry.target.animate) continue
      const animation = entry.target.animate([
        { opacity: 0.35, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
      animations.add(animation)
      animation.finished.then(() => animations.delete(animation), () => animations.delete(animation))
    }
  }, { threshold: 0, rootMargin: '0px 0px -24px 0px' })
  for (const element of root.querySelectorAll('.blog-post, .blog-album, .blog-about')) {
    if (element.dataset.blogRevealed) continue
    // Already-visible content must never wait for an entrance animation.
    if (element.getBoundingClientRect().top < window.innerHeight) element.dataset.blogRevealed = 'true'
    else observer.observe(element)
  }
  const stopMotion = () => { if (preference.matches) for (const animation of animations) animation.cancel() }
  preference.addEventListener('change', stopMotion)
  return () => {
    observer.disconnect()
    preference.removeEventListener('change', stopMotion)
    for (const animation of animations) animation.cancel()
  }
}
