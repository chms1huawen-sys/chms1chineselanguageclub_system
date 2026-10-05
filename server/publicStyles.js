export function withPublicStyles(template, manifest) {
  const css = new Set()
  const visited = new Set()
  const collect = key => {
    if (visited.has(key)) return
    visited.add(key)
    const entry = manifest[key]
    for (const path of entry?.css || []) css.add(path)
    for (const dependency of entry?.imports || []) collect(dependency)
  }
  collect('src/pages/Blog.jsx')
  const links = [...css].filter(path => /^assets\/[a-zA-Z0-9_.-]+\.css$/.test(path) && !template.includes(`href="/${path}"`))
    .map(path => `<link rel="stylesheet" href="/${path}">`).join('')
  return template.replace('</head>', () => links + '</head>')
}
