// Font network requests must not block the application stylesheet or first render.
(() => {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Noto+Sans+SC:wght@300;400;500;700&display=swap'
  link.media = 'print'
  link.addEventListener('load', () => { link.media = 'all' }, { once: true })
  document.head.appendChild(link)
})()
