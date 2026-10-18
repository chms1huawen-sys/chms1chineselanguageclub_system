import { cp, mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { securityHeaders } from '../cloudflare/public-preview/securityHeaders.js'

const output = resolve('test-results/cloudflare-preview-runtime')
await mkdir(output, { recursive: true })
await cp(resolve('dist'), output, { recursive: true })
await writeFile(resolve(output, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n' + Object.entries(securityHeaders).map(([name, value]) => `  ${name}: ${value}\n`).join(''))
await writeFile(resolve(output, '404.html'), '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="robots" content="noindex"><title>页面不存在</title><h1>页面不存在或尚未公开</h1><a href="/">返回首页</a></html>')
console.log('Prepared preview runtime assets; production files were not changed.')
