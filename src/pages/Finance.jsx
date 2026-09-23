import { useCallback, useEffect, useRef, useState } from 'react'
import { Wallet, Plus, Settings, X, RefreshCw, Loader, ChevronLeft, ChevronRight, ExternalLink, Printer, Pencil } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { hasPermission } from '../utils/permissions'
import { sendPushForNotifications } from '../utils/pushNotifications'
import './Inventory.css'
import './Finance.css'

const teachers = ['convener_teacher', 'advisor_teacher', 'advisor']
const stages = { treasury: ['待财政审核', 'Treasury review'], president: ['待主席批准', 'President review'], teacher: ['待老师批准', 'Teacher review'], approved: ['待付款', 'Awaiting payment'], paid: ['已付款', 'Paid'], returned: ['已退回修改', 'Returned for changes'], cancelled: ['已取消', 'Cancelled'] }
const actions = { submit: ['提交报销', 'Submit claim'], resubmit: ['修改并重新提交', 'Edit and resubmit'], approve: ['批准本阶段', 'Approve this stage'], return: ['退回修改', 'Return for changes'], cancel: ['取消申请', 'Cancel claim'], pay: ['确认付款', 'Record payment'], income: ['登记收入', 'Record income'], opening: ['初始 b/d', 'Initial b/d'], reverse: ['冲销记录', 'Reverse entry'] }
const messages = {
  FINANCE_FORBIDDEN: ['没有此操作的权限。', 'You do not have permission for this action.'],
  FINANCE_SELF_APPROVAL: ['自己的报销须由其他有权限的人处理，老师除外。', 'Another authorised person must process your claim. Teachers are exempt.'],
  FINANCE_STATUS_CHANGED: ['申请状态已更新，请刷新后重新处理。', 'The claim status changed. Refresh and try again.'],
  FINANCE_RECEIPTS_REQUIRED: ['请附上 1 至 5 份收据。', 'Attach 1 to 5 receipts.'],
  FINANCE_RECEIPT_INVALID: ['收据未上传成功，请重新选择。', 'Receipt upload is incomplete. Select it again.'],
  FINANCE_DATE_INVALID: ['请检查日期；支出和付款日期不能在未来，付款不能早于支出。', 'Check the dates. Expenses and payments cannot be in the future; payment cannot precede the expense.'],
  FINANCE_OPENING_EXISTS: ['初始余额只能登记一次，日期不能晚于已有账目。', 'The opening balance can only be recorded once and cannot be later than existing entries.'],
  FINANCE_BEFORE_OPENING: ['记账日期不能早于初始余额日期。', 'Entry date cannot precede the opening balance.'],
  FINANCE_NOTE_REQUIRED: ['请填写处理原因或付款凭证编号，并检查日期。', 'Enter a reason or payment reference and check the date.'],
  FINANCE_NOT_FOUND: ['记录不存在。', 'Record not found.'],
  FINANCE_INVALID: ['请检查金额、日期及填写内容。', 'Check the amount, date and details.'],
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const money = n => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cents = n => Math.round(Number(n || 0) * 100)
const pageSize = 30
function Field({ title, children }) { return <label className="inv-field"><span>{title}</span>{children}</label> }

export default function Finance({ currentUserProfile: profile, lang = 'zh', notify, management = false }) {
  const zh = lang === 'zh'
  const t = (cn, en) => zh ? cn : en
  const label = pair => pair[zh ? 0 : 1]
  const teacher = profile.is_active !== false && teachers.includes(profile.role)
  const treasury = profile.is_active !== false && hasPermission(profile, 'can_manage_finance')
  const canRecordIncome = treasury || (profile.is_active !== false && profile.role === 'chairperson')
  const president = profile.is_active !== false && hasPermission(profile, 'can_approve_finance')
  const canManage = treasury || president
  const admin = management && canManage
  const [tab, setTab] = useState(management ? 'ledger' : 'claims')
  const [month, setMonth] = useState(today().slice(0, 7))
  const [period, setPeriod] = useState('year')
  const [years, setYears] = useState([Number(today().slice(0, 4))])
  const [half, setHalf] = useState(Number(today().slice(5, 7)) <= 6 ? '1' : '2')
  const reportStart = period === 'year' ? `${month.slice(0, 4)}-01-01` : period === 'half' ? `${month.slice(0, 4)}-${half === '1' ? '01' : '07'}-01` : `${month}-01`
  const reportEnd = period === 'half' ? (half === '1' ? `${month.slice(0, 4)}-07-01` : `${Number(month.slice(0, 4)) + 1}-01-01`) : period === 'year' || month.endsWith('-12') ? `${Number(month.slice(0, 4)) + 1}-01-01` : `${month.slice(0, 4)}-${String(Number(month.slice(5)) + 1).padStart(2, '0')}-01`
  const [formats, setFormats] = useState({})
  const format = formats[lang] || { title: t('一中华文学会 · 收支账目', 'CLC_sys · Financial Statement'), category: t('类别', 'Type'), item: t('项目', 'Description'), total: t('合计', 'Total') }
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(0)
  const [count, setCount] = useState(0)
  const [claims, setClaims] = useState([])
  const [statement, setStatement] = useState({ opening: 0, closing: 0, entries: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [files, setFiles] = useState([])
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const version = useRef(0)
  const dialog = useRef(null)
  const uploaded = useRef([])

  const explain = useCallback(err => {
    const key = Object.keys(messages).find(key => err.message?.includes(key))
    if (key) return messages[key][zh ? 0 : 1]
    if (['42P01', 'PGRST200', 'PGRST202', 'PGRST205'].includes(err.code)) return zh ? '财政模块尚未安装，请先运行财政迁移 SQL。' : 'Finance setup is incomplete. Run the finance migration SQL.'
    if (err.code === '23505') return zh ? '此记录已经处理，请刷新查看。' : 'This entry was already processed. Refresh to check.'
    return err.message || (zh ? '操作失败，请重试。' : 'Operation failed. Please try again.')
  }, [zh])
  const load = useCallback(async () => {
    const seq = ++version.current
    try {
      if (admin && ['ledger', 'income'].includes(tab)) {
        const formatResult = await supabase.from('finance_report_format').select('*')
        if (formatResult.error) throw formatResult.error
        if (seq === version.current) setFormats(Object.fromEntries(formatResult.data.map(row => [row.lang, row])))
        const yearResult = await supabase.rpc('finance_report_years')
        if (yearResult.error) throw yearResult.error
        if (seq === version.current) setYears(yearResult.data)
        const { data, error: err } = await supabase.rpc('finance_report', { p_start: reportStart, p_end: reportEnd })
        if (err) throw err
        if (seq === version.current) setStatement(data)
      } else {
        let query = supabase.from('finance_claims').select('*, finance_receipts(*), finance_reviews(*)', { count: 'exact' }).order('created_at', { ascending: false }).order('id')
        if (!admin) query = query.eq('applicant_id', profile.id)
        if (tab === 'payments') query = query.in('status', status ? [status] : ['approved', 'paid'])
        else if (status) query = query.eq('status', status)
        else if (admin) query = query.in('status', ['treasury', 'president', 'teacher', 'returned', 'cancelled'])
        const result = await query.range(page * pageSize, (page + 1) * pageSize - 1)
        if (result.error) throw result.error
        if (seq === version.current) { setClaims(result.data || []); setCount(result.count || 0) }
      }
      if (seq === version.current) setError('')
    } catch (err) { if (seq === version.current) setError(explain(err)) }
    finally { if (seq === version.current) setLoading(false) }
  }, [admin, tab, reportStart, reportEnd, status, page, profile.id, explain])
  useEffect(() => {
    const sequence = version
    let timer = setTimeout(load, 0)
    const channel = supabase.channel(`finance-${profile.id}-${management}`)
    for (const table of ['finance_claims', 'finance_receipts', 'finance_reviews', 'finance_ledger', 'finance_report_format']) channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => { clearTimeout(timer); timer = setTimeout(load, 250) })
    channel.subscribe()
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', refresh)
    return () => { sequence.current++; clearTimeout(timer); supabase.removeChannel(channel); document.removeEventListener('visibilitychange', refresh) }
  }, [load, profile.id, management])
  useEffect(() => { if (modal) dialog.current?.showModal(); else dialog.current?.close() }, [modal])
  const open = (action, data = {}) => {
    uploaded.current = []; setFiles([]); setError('')
    setForm({ id: crypto.randomUUID(), entry_date: today(), expense_date: today(), title: '', description: '', amount: '', note: '', receipts: [], ...data, operation_id: crypto.randomUUID() }); setModal(action)
  }
  const change = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const close = () => { if (!lock.current) setModal(null) }
  const switchTab = next => { setLoading(true); setTab(next); setStatus(''); setPage(0) }
  const canApprove = c => admin && (teacher || c.applicant_id !== profile.id) && ((c.status === 'treasury' && treasury) || (c.status === 'president' && president) || (c.status === 'teacher' && teacher))
  const detail = claims.find(c => c.id === form.id) || form
  const receiptLink = async receipt => {
    const popup = window.open('', '_blank')
    if (popup) popup.opener = null
    const { data, error: err } = await supabase.storage.from('finance-receipts').createSignedUrl(receipt.path, 300)
    if (err) { popup?.close(); setError(explain(err)); return }
    if (popup) popup.location.href = data.signedUrl
    else setError(t('请允许打开新窗口后再查看收据。', 'Allow pop-ups to view the receipt.'))
  }
  const run = async event => {
    event.preventDefault()
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      let payload = { ...form }
      if (['submit', 'resubmit'].includes(modal)) {
        if (form.receipts.length + files.length < 1 || form.receipts.length + files.length > 5) throw new Error('FINANCE_RECEIPTS_REQUIRED')
        for (const file of files) if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type) || file.size > 20 * 1024 * 1024) throw new Error(t('收据支持 JPG、PNG、WEBP、PDF，每份最大 20MB。', 'Receipts must be JPG, PNG, WEBP or PDF, up to 20MB each.'))
        for (let i = uploaded.current.length; i < files.length; i++) {
          const file = files[i]
          const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[file.type]
          const path = `${profile.id}/${form.id}/${crypto.randomUUID()}.${ext}`
          const { error: err } = await supabase.storage.from('finance-receipts').upload(path, file)
          if (err) throw err
          uploaded.current.push({ name: file.name, path })
        }
        payload.receipts = [...form.receipts, ...uploaded.current]
      }
      const { data, error: err } = modal === 'format'
        ? await supabase.rpc('finance_save_format', { p_lang: lang, p_title: form.title, p_category: form.category, p_item: form.item, p_total: form.total })
        : modal === 'income' ? await supabase.rpc('finance_record_income', { p_data: payload })
          : await supabase.rpc('finance_mutate', { p_action: modal, p_data: payload })
      if (err) throw err
      setModal(null)
      notify?.({ type: 'success', title: t('操作成功', 'Saved successfully') })
      await load()
      if (data?.notification_ids?.length) {
        try {
          const push = await sendPushForNotifications(data.notification_ids, '/finance')
          if (push?.push_failed > 0) throw new Error('Push failed')
        } catch { notify?.({ type: 'error', title: t('记录已保存，站内通知已建立', 'Saved; in-app notifications created'), message: t('手机推送未确认成功，请勿重复提交。', 'Phone push was not confirmed. Do not submit again.') }) }
      }
    } catch (err) { setError(explain(err)); notify?.({ type: 'error', title: t('操作失败', 'Operation failed'), message: explain(err) }) }
    finally { lock.current = false; setBusy(false) }
  }
  const decision = (action, c) => open(action, { id: c.id, title: c.title, amount: c.amount, expense_date: c.expense_date, expected_status: c.status })
  const entries = statement.entries || []
  const income = entries.filter(e => Number(e.amount) > 0)
  const expense = entries.filter(e => Number(e.amount) < 0)
  const opening = cents(statement.opening), closing = cents(statement.closing)
  const leftTotal = Math.max(opening, 0) + income.reduce((sum, e) => sum + cents(e.amount), 0) + Math.max(-closing, 0)
  const rightTotal = Math.max(-opening, 0) + expense.reduce((sum, e) => sum - cents(e.amount), 0) + Math.max(closing, 0)
  const operationTitle = modal === 'format' ? t('编辑报表文字', 'Edit report labels') : modal === 'detail' ? t('报销详情', 'Claim details') : modal ? label(actions[modal]) : ''
  const periodControls = <>
    <div className="finance-period" role="group" aria-label={t('报表范围', 'Report period')}>{[['year', t('年度', 'Yearly')], ['half', t('半年度', 'Half-yearly')], ['month', t('月度', 'Monthly')]].map(([key, name]) => <button key={key} aria-pressed={period === key} onClick={() => { setPeriod(key) }}>{name}</button>)}</div>
    {period === 'half' && <Field title={t('半年', 'Half-year')}><select aria-label={t('半年', 'Half-year')} value={half} onChange={e => setHalf(e.target.value)}><option value="1">{t('上半年（1–6月）', 'First half (Jan–Jun)')}</option><option value="2">{t('下半年（7–12月）', 'Second half (Jul–Dec)')}</option></select></Field>}
    <Field title={t('年份', 'Year')}><select aria-label={t('年份', 'Year')} value={month.slice(0, 4)} onChange={e => setMonth(`${e.target.value}-${month.slice(5)}`)}>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></Field>
    {period === 'month' && <Field title={t('月份', 'Month')}><select aria-label={t('月份', 'Month')} value={month.slice(5)} onChange={e => setMonth(`${month.slice(0, 4)}-${e.target.value}`)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={String(i + 1).padStart(2, '0')}>{zh ? `${i + 1}月` : new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(2020, i, 1))}</option>)}</select></Field>}
  </>

  return <div className="inventory-page finance-page">
    <header className="inv-header"><div><h1><Wallet size={26} />{admin ? t('财政管理', 'Finance Management') : t('报销申请', 'Reimbursement Applications')}</h1></div><div className="inv-actions">
      {admin ? <a className="inv-link" href="#/finance">{t('返回报销申请', 'Back to applications')}</a> : canManage && <a className="inv-link" href="#/finance-management"><Settings size={17} />{t('财政管理', 'Manage finance')}</a>}
      {admin && <button className="inv-primary" disabled={!canRecordIncome} title={!canRecordIncome ? t('需要财政管理权限', 'Finance management permission required') : undefined} onClick={() => open('income')}><Plus size={17} />{t('登记收入', 'Record income')}</button>}
      <button className="inv-icon" aria-label={t('刷新', 'Refresh')} title={t('刷新', 'Refresh')} onClick={load}><RefreshCw size={18} /></button>
    </div></header>
    {admin && <nav className="inv-tabs" aria-label={t('财政分页', 'Finance sections')}>{[['ledger', t('财政账簿', 'Ledger')], ['income', t('收入登记', 'Income')], ['claims', t('报销审批', 'Claim reviews')], ['payments', t('付款记录', 'Payments')]].map(([key, name]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => switchTab(key)}>{name}</button>)}</nav>}
    {error && <div role="alert" className="inv-error">{error}</div>}
    {admin && tab === 'ledger' ? <>
      <div className="inv-toolbar finance-no-print">{periodControls}
        {treasury && <button onClick={() => open('opening')}>{t('初始 b/d', 'Initial b/d')}</button>}
        {canRecordIncome && <button onClick={() => open('format', format)}><Pencil size={17} />{t('编辑报表文字', 'Edit report labels')}</button>}
        <button disabled={loading || !!error} title={t('打印账簿', 'Print ledger')} onClick={() => window.print()}><Printer size={18} />{t('打印', 'Print')}</button>
      </div>
      {loading ? <div className="inv-skeleton" aria-label={t('加载中', 'Loading')} role="status"><div /></div> : <section className="finance-statement">
        <h2>{format.title} · {period === 'month' ? month : month.slice(0, 4)}{period === 'half' && ` · ${half === '1' ? t('上半年', 'First half') : t('下半年', 'Second half')}`}</h2>
        <div className="finance-table-scroll"><table className="finance-table"><thead><tr><th>{format.category}</th><th>{format.item}</th><th>{t('收入', 'Income')} RM</th><th>{t('支出', 'Expenses')} RM</th></tr></thead><tbody>
          <tr><td>{t('收入', 'Income')}</td><th>b/d</th><td>{opening >= 0 ? money(opening / 100) : ''}</td><td>{opening < 0 ? money(-opening / 100) : ''}</td></tr>
          {[...income, ...expense].map((e, i) => <tr key={e.id}><td>{i === income.length ? t('支出', 'Expenses') : ''}</td><td><span className="finance-entry-title">{e.description}</span><small>{e.entry_date} · {e.actor_name}</small>
            {e.claim_id && <button className="finance-no-print" onClick={async () => { const { data, error: err } = await supabase.from('finance_claims').select('*, finance_receipts(*), finance_reviews(*)').eq('id', e.claim_id).single(); if (err) setError(explain(err)); else open('detail', data) }}>{t('报销详情', 'Claim details')}</button>}
          </td><td>{Number(e.amount) > 0 ? money(e.amount) : ''}</td><td>{Number(e.amount) < 0 ? money(-Number(e.amount)) : ''}</td></tr>)}
          <tr><td>{t('结存', 'Balance')}</td><th>c/d</th><td>{closing < 0 ? money(-closing / 100) : ''}</td><td>{closing >= 0 ? money(closing / 100) : ''}</td></tr>
        </tbody><tfoot><tr><th colSpan="2">{format.total}</th><td>{money(leftTotal / 100)}</td><td>{money(rightTotal / 100)}</td></tr></tfoot></table></div>
      </section>}
    </> : admin && tab === 'income' ? <>
      <div className="inv-toolbar">{periodControls}
      </div>
      {!canRecordIncome && <p className="inv-error">{t('你目前可以查看收入。登记收入需要由老师在账号管理中授予财政管理权限。', 'You can view income. Ask a teacher to grant finance management permission to record income.')}</p>}
      {loading ? <div className="inv-skeleton" role="status" aria-label={t('加载中', 'Loading')}><div /></div> : <div className="inv-rows">
        {!entries.some(e => e.kind === 'income' || e.kind === 'reversal') && <p className="inv-empty">{t('所选期间暂无收入记录', 'No income entries in this period')}</p>}
        {entries.filter(e => e.kind === 'income' || e.kind === 'reversal').map(e => <article className="inv-history" key={e.id}><div><strong>{e.description}</strong><strong>RM {money(e.amount)}</strong></div><p>{e.entry_date} · {e.actor_name}</p>
          {e.kind === 'reversal' && <span className="inv-badge">{t('冲销记录', 'Reversal')}</span>}
          {treasury && e.kind === 'income' && <button onClick={() => open('reverse', { id: e.id, title: e.description, amount: e.amount })}>{t('冲销', 'Reverse')}</button>}
        </article>)}
      </div>}
    </> : <>
      <div className="inv-toolbar"><select aria-label={t('状态筛选', 'Status filter')} value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}><option value="">{t('所有状态', 'All statuses')}</option>{Object.entries(stages).filter(([key]) => !admin || (tab === 'payments' ? ['approved', 'paid'].includes(key) : !['approved', 'paid'].includes(key))).map(([key, value]) => <option key={key} value={key}>{label(value)}</option>)}</select>
        {!admin && <button className="inv-primary" onClick={() => open('submit')}><Plus size={18} />{t('申请报销', 'New claim')}</button>}
      </div>
      {loading ? <div className="inv-skeleton" role="status" aria-label={t('加载中', 'Loading')}><div /><div /></div> : <div className="inv-rows">{!claims.length && <p className="inv-empty">{t('暂无记录', 'No records')}</p>}{claims.map(c => <button className="inv-request" key={c.id} onClick={() => open('detail', c)}><div><strong>{c.title}</strong><p>{c.applicant_name} · {c.expense_date}</p></div><div><strong>RM {money(c.amount)}</strong><span className={`inv-badge ${c.status}`}>{label(stages[c.status])}</span></div></button>)}</div>}
      <div className="inv-pagination"><button aria-label={t('上一页', 'Previous page')} disabled={!page} onClick={() => setPage(p => p - 1)}><ChevronLeft size={18} /></button><span>{page + 1} / {Math.max(1, Math.ceil(count / pageSize))}</span><button aria-label={t('下一页', 'Next page')} disabled={(page + 1) * pageSize >= count} onClick={() => setPage(p => p + 1)}><ChevronRight size={18} /></button></div>
    </>}
    <dialog ref={dialog} className="inv-dialog" onCancel={e => { e.preventDefault(); close() }}>{modal && <>
      <header><h2>{operationTitle}</h2><button disabled={busy} aria-label={t('关闭', 'Close')} onClick={close}><X size={19} /></button></header>
      {error && <div role="alert" className="inv-error">{error}</div>}
      {modal === 'detail' ? <div className="inv-form"><h3>{detail.title}</h3><p>{detail.applicant_name} · RM {money(detail.amount)} · {label(stages[detail.status])}</p><p>{detail.expense_date}</p><p className="inv-note">{detail.description}</p>
        <h3>{t('收据', 'Receipts')}</h3>{detail.finance_receipts?.map(r => <button key={r.id} onClick={() => receiptLink(r)}><ExternalLink size={16} />{r.name}</button>)}
        <h3>{t('处理记录', 'Processing history')}</h3>{[...(detail.finance_reviews || [])].sort((a, b) => a.created_at.localeCompare(b.created_at)).map(r => <div className="inv-line" key={r.id}><strong>{r.actor_name} · {actions[r.action] ? label(actions[r.action]) : r.action}</strong><p>{label(stages[r.to_status])} · {new Date(r.created_at).toLocaleString(zh ? 'zh-CN' : 'en-GB')}</p><p>{r.note}</p></div>)}
        <div className="inv-actions">{canApprove(detail) && <><button className="inv-primary" onClick={() => decision('approve', detail)}>{t('批准本阶段', 'Approve this stage')}</button><button onClick={() => decision('return', detail)}>{t('退回修改', 'Return for changes')}</button></>}
          {admin && treasury && detail.status === 'approved' && (teacher || detail.applicant_id !== profile.id) && <button className="inv-primary" onClick={() => decision('pay', detail)}>{t('确认付款', 'Record payment')}</button>}
          {!admin && detail.applicant_id === profile.id && detail.status === 'returned' && <button onClick={() => open('resubmit', { ...detail, receipts: detail.finance_receipts || [] })}>{t('修改并重新提交', 'Edit and resubmit')}</button>}
          {!admin && detail.applicant_id === profile.id && ['treasury', 'president', 'teacher', 'returned'].includes(detail.status) && <button onClick={() => decision('cancel', detail)}>{t('取消申请', 'Cancel claim')}</button>}
        </div>
      </div> : <form onSubmit={run} className="inv-form">
        {modal === 'format' && [['title', t('标题', 'Title'), 120], ['category', t('类别', 'Type'), 30], ['item', t('项目', 'Description'), 30], ['total', t('合计', 'Total'), 30]].map(([key, name, max]) => <Field key={key} title={name}><input required maxLength={max} value={form[key]} onChange={e => change(key, e.target.value)} /></Field>)}
        {['submit', 'resubmit'].includes(modal) && <><Field title={t('报销事项', 'Claim title')}><input required maxLength={160} value={form.title} onChange={e => change('title', e.target.value)} /></Field><Field title={t('说明', 'Description')}><textarea maxLength={3000} value={form.description} onChange={e => change('description', e.target.value)} /></Field><Field title={t('支出日期', 'Expense date')}><input type="date" required max={today()} value={form.expense_date} onChange={e => change('expense_date', e.target.value)} /></Field>
          <Field title={t('收据（最多 5 份，每份 20MB）', 'Receipts (up to 5, 20MB each)')}><input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" disabled={busy} onChange={e => { uploaded.current = []; setFiles(Array.from(e.target.files || [])) }} /></Field>
          {form.receipts.map((r, i) => <div className="inv-actions" key={r.path}><span>{r.name}</span><button type="button" aria-label={t('移除收据', 'Remove receipt')} onClick={() => change('receipts', form.receipts.filter((_, n) => n !== i))}><X size={16} /></button></div>)}
          {files.map((f, i) => <small key={i}>{f.name}</small>)}
        </>}
        {['submit', 'resubmit', 'income', 'opening'].includes(modal) && <Field title={t('金额（RM）', 'Amount (RM)')}><input type="number" required min="0.01" max="9999999.99" step="0.01" value={form.amount} onChange={e => change('amount', e.target.value)} /></Field>}
        {['income', 'opening'].includes(modal) && <Field title={t('项目说明', 'Entry description')}><input required maxLength={500} value={form.description} onChange={e => change('description', e.target.value)} /></Field>}
        {['income', 'opening', 'pay', 'reverse'].includes(modal) && <Field title={t('记账日期', 'Entry date')}><input type="date" required max={today()} min={modal === 'pay' ? form.expense_date : undefined} value={form.entry_date} onChange={e => change('entry_date', e.target.value)} /></Field>}
        {['approve', 'return', 'cancel', 'pay', 'reverse'].includes(modal) && <><p><strong>{form.title}</strong> · RM {money(form.amount)}</p><Field title={modal === 'pay' ? t('付款方式及凭证编号', 'Payment method and reference') : t('处理备注', 'Note')}><textarea required={['return', 'pay', 'reverse'].includes(modal)} maxLength={3000} value={form.note} onChange={e => change('note', e.target.value)} /></Field></>}
        <footer><button type="button" onClick={close} disabled={busy}>{t('取消', 'Cancel')}</button><button className="inv-primary" type="submit" disabled={busy}>{busy && <Loader className="inv-spin" size={17} />}{busy ? t('处理中…', 'Processing…') : t('确认', 'Confirm')}</button></footer>
      </form>}
    </>}</dialog>
  </div>
}
