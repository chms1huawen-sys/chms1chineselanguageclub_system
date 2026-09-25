import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const projectDir = resolve(process.cwd())
const outDir = join(projectDir, 'docs', 'user-guide-pdf')
const screenshotDir = join(outDir, 'screenshots')
const browserProfile = join(outDir, '.browser-profile')
const browserExe = process.env.GUIDE_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const email = process.env.GUIDE_EMAIL
const password = process.env.GUIDE_PASSWORD
const baseUrl = process.env.GUIDE_BASE_URL || 'http://127.0.0.1:5173'
const remotePort = Number(process.env.GUIDE_REMOTE_PORT || 9223)

if (!email || !password) {
  throw new Error('Set GUIDE_EMAIL and GUIDE_PASSWORD before running this script.')
}

if (!existsSync(browserExe)) {
  throw new Error(`Browser not found: ${browserExe}`)
}

mkdirSync(screenshotDir, { recursive: true })
rmSync(browserProfile, { recursive: true, force: true })

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms))

const waitForHttp = async (url, timeoutMs = 30000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok) return response
    } catch {
      // keep waiting
    }
    await sleep(500)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

const vite = spawn('npm.cmd', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5173'], {
  cwd: projectDir,
  stdio: 'pipe',
  shell: true,
})

vite.stdout.on('data', (chunk) => process.stdout.write(`[vite] ${chunk}`))
vite.stderr.on('data', (chunk) => process.stderr.write(`[vite] ${chunk}`))

const browser = spawn(browserExe, [
  '--headless=new',
  `--remote-debugging-port=${remotePort}`,
  `--user-data-dir=${browserProfile}`,
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,1100',
  'about:blank',
], {
  stdio: 'ignore',
  shell: false,
})

const cleanup = () => {
  try { browser.kill() } catch {}
  try { vite.kill() } catch {}
  try { rmSync(browserProfile, { recursive: true, force: true }) } catch {}
}

process.on('exit', cleanup)
process.on('SIGINT', () => {
  cleanup()
  process.exit(130)
})

const createCdp = async () => {
  await waitForHttp(`${baseUrl}/`)
  await waitForHttp(`http://127.0.0.1:${remotePort}/json/version`)
  const newPageResponse = await fetch(`http://127.0.0.1:${remotePort}/json/new?${encodeURIComponent(baseUrl)}`, { method: 'PUT' })
  const pageInfo = await newPageResponse.json()
  const ws = new WebSocket(pageInfo.webSocketDebuggerUrl)
  await new Promise((resolveOpen, rejectOpen) => {
    ws.addEventListener('open', resolveOpen, { once: true })
    ws.addEventListener('error', rejectOpen, { once: true })
  })

  let id = 0
  const pending = new Map()
  const consoleLogs = []
  ws.addEventListener('message', (event) => {
    const payload = JSON.parse(event.data)
    if (payload.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push(payload.params.args.map((arg) => arg.value || arg.description || '').join(' '))
    }
    if (payload.method === 'Runtime.exceptionThrown') {
      consoleLogs.push(`EXCEPTION: ${payload.params.exceptionDetails.text}`)
    }
    if (!payload.id) return
    const item = pending.get(payload.id)
    if (!item) return
    pending.delete(payload.id)
    if (payload.error) item.reject(new Error(payload.error.message))
    else item.resolve(payload.result)
  })

  const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
    const callId = ++id
    pending.set(callId, { resolve: resolveSend, reject: rejectSend })
    ws.send(JSON.stringify({ id: callId, method, params }))
  })

  await send('Page.enable')
  await send('Runtime.enable')
  await send('Page.bringToFront')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  })

  return { send, ws, consoleLogs }
}

const evaluate = async (cdp, expression, awaitPromise = true) => {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime evaluation failed')
  }
  return result.result?.value
}

const navigate = async (cdp, url, waitMs = 2500) => {
  await cdp.send('Page.navigate', { url })
  await sleep(waitMs)
}

const pageInfo = async (cdp) => evaluate(cdp, `
  (() => ({
    href: location.href,
    title: document.title,
    text: (document.body?.innerText || '').slice(0, 1200),
    childCount: document.body?.children.length || 0,
    hasEmailInput: !!document.querySelector('input[type="email"]'),
    hasPasswordInput: !!document.querySelector('input[type="password"]')
  }))()
`)

const isLoadingText = (text) => (
  text.includes('载入系统中') ||
  text.includes('加载') ||
  text.includes('Loading System') ||
  text.includes('Loading...')
)

const waitForAppReady = async (cdp, timeoutMs = 45000) => {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const info = await pageInfo(cdp)
    const ready = !info.hasEmailInput && info.childCount > 0 && !isLoadingText(info.text)
    if (ready) {
      await sleep(1600)
      return true
    }
    await sleep(900)
  }

  const info = await pageInfo(cdp)
  writeFileSync(join(outDir, 'debug-page-state.json'), JSON.stringify({
    info,
    consoleLogs: cdp.consoleLogs.slice(-80),
  }, null, 2), 'utf8')
  throw new Error(`App did not become ready. Current text: ${info.text}`)
}

const screenshot = async (cdp, name, title) => {
  await sleep(1200)
  const info = await pageInfo(cdp)
  console.log(`[capture] ${name}: ${info.href} | ${info.text.slice(0, 90).replace(/\s+/g, ' ')}`)
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: 1440, height: 1100, scale: 1 },
  })
  const file = join(screenshotDir, `${name}.png`)
  writeFileSync(file, Buffer.from(data, 'base64'))
  return { name, title, file }
}

const login = async (cdp) => {
  await navigate(cdp, `${baseUrl}/`, 2500)
  const loginCapture = await screenshot(cdp, '01-login', '登入系统')
  const emailJson = JSON.stringify(email)
  const passwordJson = JSON.stringify(password)
  const filledLogin = await evaluate(cdp, `
    (() => {
      const emailInput = document.querySelector('input[type="email"]')
      const passwordInput = document.querySelector('input[type="password"]')
      const submitButton = document.querySelector('button[type="submit"]')
      if (!emailInput || !passwordInput || !submitButton) return false
      const setValue = (el, value) => {
        const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
        descriptor.set.call(el, value)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      }
      setValue(emailInput, ${emailJson})
      setValue(passwordInput, ${passwordJson})
      submitButton.click()
      return true
    })()
  `)

  if (!filledLogin) {
    await waitForAppReady(cdp, 30000)
    return loginCapture
  }

  await sleep(2500)
  const afterLogin = await pageInfo(cdp)
  if (afterLogin.hasEmailInput) {
    writeFileSync(join(outDir, 'debug-login-state.json'), JSON.stringify(afterLogin, null, 2), 'utf8')
    throw new Error(`Login did not leave login page. Current text: ${afterLogin.text}`)
  }

  await waitForAppReady(cdp, 60000)
  return loginCapture
}

const capturePages = async (cdp) => {
  const captures = []
  captures.push(await screenshot(cdp, '02-dashboard', 'Dashboard 仪表盘'))

  const pages = [
    ['/#/tasks', '03-tasks', '任务页面 Tasks'],
    ['/#/leave', '04-leave', '请假申请 Leave'],
    ['/#/calendar', '05-calendar', '行事历 Calendar'],
    ['/#/members', '06-members', '账号管理 Members'],
    ['/#/settings', '07-settings', '设置与 PWA 推送'],
  ]

  for (const [path, name, title] of pages) {
    await navigate(cdp, `${baseUrl}${path}`, 2500)
    await waitForAppReady(cdp, 45000)
    captures.push(await screenshot(cdp, name, title))
  }

  return captures
}

const fileUrl = (filePath) => `file:///${filePath.replace(/\\/g, '/').replace(/ /g, '%20')}`

const buildGuideHtml = (captures) => {
  const sections = [
    {
      title: '1. 登入系统',
      screenshot: captures.find(c => c.name === '01-login'),
      points: ['输入主席或老师给予的账号与密码。', '请勿把账号分享给其他人。', '登入后会进入 Dashboard 仪表盘。'],
    },
    {
      title: '2. Dashboard 仪表盘',
      screenshot: captures.find(c => c.name === '02-dashboard'),
      points: ['查看待完成任务、本月活动、请假、公告和系统动态。', '快捷入口会根据身份自动显示。', '普通会员不会看到管理成员入口。'],
    },
    {
      title: '3. 任务页面 Tasks',
      screenshot: captures.find(c => c.name === '03-tasks'),
      points: ['管理层可发布任务和查看成员任务表现。', '普通会员只看自己相关团队与被分配的任务。', '任务完成后会通知老师、主席、副主席和发布者。'],
    },
    {
      title: '4. 请假申请 Leave',
      screenshot: captures.find(c => c.name === '04-leave'),
      points: ['选择请假类型、日期并填写原因。', '请先把签名请假信上传到指定 Google Drive。', '把文件分享链接贴入系统保存记录。'],
    },
    {
      title: '5. 行事历 Calendar',
      screenshot: captures.find(c => c.name === '05-calendar'),
      points: ['蓝色是学会活动，绿色是内部会议。', '活动与会议会在 7 天、3 天、1 天前提醒。', '红色截止日期由任务提醒规则处理。'],
    },
    {
      title: '6. 账号管理 Members',
      screenshot: captures.find(c => c.name === '06-members'),
      points: ['只有召集老师、指导老师、主席、副主席可以管理成员。', '可新增、修改、停用或启用账号。', '文书不会看到管理成员入口。'],
    },
    {
      title: '7. 设置与 PWA 推送',
      screenshot: captures.find(c => c.name === '07-settings'),
      points: ['iPhone 必须用 Safari 加入主屏幕后开启推送。', 'Android / Desktop 可用 Chrome 或 Edge 开启通知。', '如果收不到通知，先回设置重新启用推送。'],
    },
  ]

  return `<!doctype html>
<html lang="zh">
<head>
  <meta charset="utf-8" />
  <title>CHMS1 Chinese Language Club System User Guide</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: "Nunito", "Segoe UI", "Microsoft YaHei", sans-serif; color: #172033; background: #f0f7ff; }
    .page { page-break-after: always; min-height: 184mm; padding: 12mm; background: linear-gradient(135deg, #e0f1ff 0%, #ffffff 55%, #fff0f5 100%); position: relative; overflow: hidden; }
    .cover { display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; }
    .cover img { width: 96px; height: 96px; border-radius: 999px; box-shadow: 0 12px 28px rgba(149,203,255,.45); }
    h1 { font-size: 34px; margin: 20px 0 8px; }
    h2 { font-size: 24px; margin: 0 0 12px; color: #1a1a1a; }
    .subtitle { color: #5f6f87; font-weight: 800; font-size: 15px; }
    .layout { display: grid; grid-template-columns: 1.45fr .9fr; gap: 18px; align-items: stretch; }
    .shot { background: white; border: 3px solid #95CBFF; border-radius: 24px; padding: 8px; box-shadow: 0 14px 36px rgba(149,203,255,.22); }
    .shot img { width: 100%; height: 134mm; object-fit: contain; display: block; border-radius: 16px; background: #fff; }
    .notes { display: flex; flex-direction: column; gap: 12px; }
    .note { background: white; border: 2px solid #e0f1ff; border-radius: 20px; padding: 14px 16px; box-shadow: 0 8px 22px rgba(149,203,255,.13); font-size: 15px; font-weight: 800; line-height: 1.45; }
    .badge { display: inline-flex; background: #FFB3C6; color: white; border-radius: 999px; padding: 6px 12px; font-size: 12px; font-weight: 1000; margin-bottom: 8px; }
    .arrow { color: #6db8ff; font-weight: 1000; margin-right: 6px; }
    .matrix { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 18px; width: 100%; max-width: 900px; }
    .card { background: white; border: 2px solid #e0f1ff; border-radius: 20px; padding: 16px; font-weight: 900; box-shadow: 0 8px 22px rgba(149,203,255,.14); }
    .card strong { color: #4b8ed8; display: block; margin-bottom: 6px; }
    .footer { position: absolute; right: 14mm; bottom: 8mm; color: #7b8498; font-size: 10px; font-weight: 800; }
  </style>
</head>
<body>
  <section class="page cover">
    <img src="${fileUrl(join(projectDir, 'public', 'logo-192.png'))}" />
    <h1>CHMS1 Chinese Language Club System</h1>
    <div class="subtitle">图文版用户指南 / Visual User Guide</div>
    <div class="matrix">
      <div class="card"><strong>Tasks</strong>任务分配、状态追踪、成员表现</div>
      <div class="card"><strong>Leave</strong>请假记录、Google Drive 链接</div>
      <div class="card"><strong>Calendar</strong>活动、会议、自动提醒</div>
      <div class="card"><strong>PWA</strong>手机推送与站内通知</div>
    </div>
    <div class="footer">CLC_sys User Guide</div>
  </section>
  ${sections.map((section) => `
  <section class="page">
    <div class="badge">操作说明</div>
    <h2>${section.title}</h2>
    <div class="layout">
      <div class="shot"><img src="${fileUrl(section.screenshot.file)}" /></div>
      <div class="notes">
        ${section.points.map((point, index) => `<div class="note"><span class="arrow">${index + 1}.</span>${point}</div>`).join('')}
      </div>
    </div>
    <div class="footer">CHMS1 Chinese Language Club System</div>
  </section>`).join('')}
</body>
</html>`
}

const printPdf = async (cdp, htmlFile, pdfFile) => {
  await navigate(cdp, fileUrl(htmlFile), 1500)
  const pdf = await cdp.send('Page.printToPDF', {
    printBackground: true,
    landscape: true,
    paperWidth: 11.69,
    paperHeight: 8.27,
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
  })
  writeFileSync(pdfFile, Buffer.from(pdf.data, 'base64'))
}

const existingCaptures = () => [
  ['01-login', '登入系统'],
  ['02-dashboard', 'Dashboard 仪表盘'],
  ['03-tasks', '任务页面 Tasks'],
  ['04-leave', '请假申请 Leave'],
  ['05-calendar', '行事历 Calendar'],
  ['06-members', '账号管理 Members'],
  ['07-settings', '设置与 PWA 推送'],
].map(([name, title]) => ({ name, title, file: join(screenshotDir, `${name}.png`) }))

try {
  const cdp = await createCdp()
  const captures = process.env.GUIDE_SKIP_CAPTURE === 'true'
    ? existingCaptures()
    : [await login(cdp), ...(await capturePages(cdp))]
  const htmlFile = join(outDir, 'CLC_System_User_Guide_Visual.html')
  const pdfFile = join(outDir, 'CLC_System_User_Guide_Visual.pdf')
  writeFileSync(htmlFile, buildGuideHtml(captures), 'utf8')
  await printPdf(cdp, htmlFile, pdfFile)
  console.log(`PDF created: ${pdfFile}`)
  cdp.ws.close()
} finally {
  cleanup()
}
