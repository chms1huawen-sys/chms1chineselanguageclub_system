import { cloneElement, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Package, Plus, Minus, ShoppingCart, Tag, Search, Pencil, X, RefreshCw, ChevronLeft, ChevronRight, Loader, ImagePlus, Settings } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { hasPermission } from '../utils/permissions'
import { sendPushForNotifications } from '../utils/pushNotifications'
import './Inventory.css'

const TEACHERS = ['convener_teacher', 'advisor_teacher', 'advisor']
const PAGE_SIZE = 30
const EMPTY_ITEM = { name: '', category_id: '', mode: 'loan', asset_code: '', unit: '', location: '', notes: '', photo_path: '', quantity: 0, is_active: true }
const statusLabels = {
  pending: ['待审批', 'Pending'], approved: ['待领取', 'Ready for collection'], rejected: ['已拒绝', 'Rejected'],
  cancelled: ['已取消', 'Cancelled'], issued: ['借用中', 'On loan'], closed: ['已完成', 'Completed'],
}
const actionLabels = {
  item: ['物品建档或修改', 'Item saved'], adjust: ['库存调整', 'Stock adjustment'], submit: ['提交申请', 'Submit request'],
  approve: ['批准', 'Approve'], reject: ['拒绝', 'Reject'], cancel: ['取消申请', 'Cancel request'], issue: ['确认领取', 'Confirm collection'], return: ['归还验收 / 退库', 'Accept return'],
}
const errors = {
  INVENTORY_FORBIDDEN: ['没有操作权限，请联系老师。', 'You do not have permission. Contact a teacher.'],
  INVENTORY_SELF_APPROVAL: ['只有老师可以审批自己的申请。', 'Only teachers may approve their own requests.'],
  INVENTORY_NOT_FOUND: ['记录不存在，请刷新后重试。', 'Record not found. Refresh and try again.'],
  INVENTORY_STOCK_UNAVAILABLE: ['可用库存不足或物品已停用，请刷新后调整数量。', 'Insufficient stock or inactive item. Refresh and adjust quantities.'],
  INVENTORY_STATUS_CHANGED: ['申请状态已改变，请刷新后重试。', 'The request status has changed. Refresh and try again.'],
  INVENTORY_NOTE_REQUIRED: ['请填写处理原因或备注。', 'Please enter a reason or note.'],
  INVENTORY_MODE_LOCKED: ['已有申请记录，不能更改管理方式或编号。请另建物品。', 'Items with requests cannot change mode or asset code. Create a new item.'],
  INVENTORY_OUTSTANDING: ['物品仍有预留或借出数量，暂时不能停用。', 'Reserved or borrowed items cannot be deactivated.'],
  INVENTORY_DATE_INVALID: ['领取日期不能早于今天。', 'Collection date cannot be before today.'],
  INVENTORY_DUE_REQUIRED: ['借还物品需要填写预计归还日期。', 'A return date is required for loans.'],
  INVENTORY_RETURN_INVALID: ['归还数量不正确，请检查未归还数量。', 'Invalid return quantity. Check the outstanding balance.'],
  INVENTORY_LINES_REQUIRED: ['请选择至少一种物品。', 'Select at least one item.'],
  INVENTORY_CATEGORY_REQUIRED: ['请选择物品分类。', 'Select an item category.'],
}

const malaysiaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const outstanding = line => line.quantity - line.returned - line.damaged - line.lost
const isOverdue = (request, today = malaysiaToday()) => request.status === 'issued' && request.due_date < today && request.inventory_request_lines?.some(line => line.mode === 'loan' && outstanding(line) > 0)

function Field({ label, children }) {
  const id = useId()
  return <label className="inv-field"><span id={id}>{label}</span>{cloneElement(children, children.props['aria-label'] ? {} : { 'aria-labelledby': id })}</label>
}

export default function Inventory({ currentUserProfile, lang = 'zh', notify, management = false }) {
  const zh = lang === 'zh'
  const t = (cn, en) => zh ? cn : en
  const label = pair => pair[zh ? 0 : 1]
  const canManage = management && currentUserProfile?.is_active !== false && hasPermission(currentUserProfile, 'can_manage_inventory')
  const canApprove = management && currentUserProfile?.is_active !== false && hasPermission(currentUserProfile, 'can_approve_inventory')
  const canReview = canManage || canApprove
  const hasManagementAccess = currentUserProfile?.is_active !== false && (hasPermission(currentUserProfile, 'can_manage_inventory') || hasPermission(currentUserProfile, 'can_approve_inventory'))
  const teacher = TEACHERS.includes(currentUserProfile?.role)
  const [tab, setTab] = useState(management && !canManage ? 'requests' : 'items')
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [requests, setRequests] = useState([])
  const [movements, setMovements] = useState([])
  const [requestCount, setRequestCount] = useState(0)
  const [movementCount, setMovementCount] = useState(0)
  const [page, setPage] = useState(0)
  const scope = canReview ? 'all' : 'mine'
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const loadVersion = useRef(0)
  const [modal, setModal] = useState(null)
  const [form, setForm] = useState({})
  const [photo, setPhoto] = useState(null)
  const [cart, setCart] = useState([])
  const [draft, setDraft] = useState(null)
  const dialogRef = useRef(null)

  const explain = useCallback(err => {
    const key = Object.keys(errors).find(key => err.message?.includes(key))
    if (key) return errors[key][zh ? 0 : 1]
    if (['42P01', 'PGRST200', 'PGRST202', 'PGRST205'].includes(err.code)) return zh ? '物品管理尚未安装或数据库结构未更新，请先运行物品管理迁移 SQL。' : 'Inventory setup is incomplete. Run the inventory migration SQL first.'
    if (err.code === '23505') return zh ? '名称、编号或申请物品重复，请检查。' : 'Duplicate name, asset code or request item.'
    if (err.code === '23514') return zh ? '数量不符合库存规则；逐件编号物品最多只能记录一件。' : 'Invalid stock quantity. Individually numbered items can contain only one unit.'
    return err.message || (zh ? '操作失败，请重试。' : 'Operation failed. Please retry.')
  }, [zh])

  const load = useCallback(async () => {
    const version = ++loadVersion.current
    let query = supabase.from('inventory_requests').select('*, inventory_request_lines(*)', { count: 'exact' }).order('created_at', { ascending: false }).order('id')
    if (scope === 'mine' || !canReview) query = query.eq('applicant_id', currentUserProfile.id)
    if (status) query = query.eq('status', status === 'overdue' ? 'issued' : status)
    if (status === 'overdue') query = query.lt('due_date', malaysiaToday())
    // Catalogue reads are paged too, so stock beyond the API row limit is not hidden.
    const readCatalogue = async table => {
      const rows = []
      for (let start = 0; ; start += 500) {
        const result = await supabase.from(table).select('*').order('name').order('id').range(start, start + 499)
        if (result.error) throw result.error
        rows.push(...result.data)
        if (result.data.length < 500) return rows
      }
    }
    try {
      const [cat, stock, req, log] = await Promise.all([
        readCatalogue('inventory_categories'), readCatalogue('inventory_items'),
        query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1),
        canReview ? supabase.from('inventory_movements').select('*, inventory_items(name)', { count: 'exact' }).order('created_at', { ascending: false }).order('id').range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1) : Promise.resolve({ data: [], count: 0 }),
      ])
      if (req.error || log.error) throw req.error || log.error
      const paths = stock.map(i => i.photo_path).filter(Boolean)
      const signed = paths.length ? await supabase.storage.from('inventory-photos').createSignedUrls(paths, 3600) : { data: [] }
      const urls = new Map((signed.data || []).map(entry => [entry.path, entry.signedUrl]))
      if (version !== loadVersion.current) return
      setCategories(cat); setItems(stock.map(i => ({ ...i, photo_url: urls.get(i.photo_path) })))
      setRequests(req.data || []); setRequestCount(req.count || 0)
      setMovements(log.data || []); setMovementCount(log.count || 0); setError('')
    } catch (err) {
      if (version === loadVersion.current) setError(explain(err))
    } finally {
      if (version === loadVersion.current) setLoading(false)
    }
  }, [scope, canReview, currentUserProfile.id, status, page, explain])

  useEffect(() => {
    const sequence = loadVersion
    let timer = setTimeout(load, 0)
    const channel = supabase.channel(`inventory-${currentUserProfile.id}`)
    for (const table of ['inventory_items', 'inventory_categories', 'inventory_requests', 'inventory_request_lines', 'inventory_movements']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        clearTimeout(timer); timer = setTimeout(load, 250)
      })
    }
    channel.subscribe()
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', refresh)
    return () => { sequence.current++; clearTimeout(timer); supabase.removeChannel(channel); document.removeEventListener('visibilitychange', refresh) }
  }, [load, currentUserProfile.id])

  useEffect(() => {
    if (modal) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [modal])

  const open = (type, data = {}) => { setForm({ ...data, operation_id: crypto.randomUUID() }); setPhoto(null); setError(''); setModal(type) }
  const close = () => { if (!busyRef.current) { if (modal === 'submit') setDraft(form); setModal(null) } }
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const run = async (action, payload) => {
    if (busyRef.current) return
    busyRef.current = true; setBusy(true); setError('')
    let uploadedPath
    let saved = false
    try {
      if (action === 'submit' && (!payload.lines.length || payload.lines.some(line => {
        const item = items.find(i => i.id === line.item_id)
        return !item?.is_active || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > item.available
      }))) throw new Error('INVENTORY_STOCK_UNAVAILABLE')
      if (action === 'item' && photo) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(photo.type) || photo.size > 5 * 1024 * 1024) throw new Error(t('照片只支持 JPG、PNG、WEBP，最大 5MB。', 'Photos must be JPG, PNG or WEBP, up to 5MB.'))
        uploadedPath = `${currentUserProfile.id}/${crypto.randomUUID()}.${({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' })[photo.type]}`
        const result = await supabase.storage.from('inventory-photos').upload(uploadedPath, photo)
        if (result.error) throw result.error
        payload = { ...payload, photo_path: uploadedPath }
      }
      const { data, error: mutationError } = await supabase.rpc('inventory_mutate', { p_action: action, p_data: payload })
      if (mutationError) throw mutationError
      saved = true
      if (action === 'submit') { setCart([]); setDraft(null) }
      setModal(null)
      notify?.({ title: t('操作成功', 'Saved successfully') })
      await load()
      if (data?.notification_ids?.length) {
        try {
          const push = await sendPushForNotifications(data.notification_ids, '/inventory')
          if (push?.push_failed > 0) throw new Error('push_failed')
        } catch {
          notify?.({ type: 'error', title: t('记录已保存，站内通知已建立', 'Saved; in-app notifications created'), message: t('手机推送暂未成功，请勿重复提交申请。', 'Phone push was not confirmed. Do not submit the request again.') })
        }
      }
    } catch (err) {
      // A lost response can still mean the transaction committed. Keep that photo.
      if (uploadedPath && !saved && /^\d{5}$/.test(err.code || '')) await supabase.storage.from('inventory-photos').remove([uploadedPath])
      setError(explain(err)); notify?.({ type: 'error', title: t('操作失败', 'Operation failed'), message: explain(err) })
    } finally { busyRef.current = false; setBusy(false) }
  }

  const setQuantity = (itemId, quantity, editing = false) => {
    if (!editing) quantity = Number(quantity)
    if (busyRef.current || (!editing && (!Number.isInteger(quantity) || quantity < 0))) return
    const item = items.find(i => i.id === itemId)
    if (!editing && quantity > 0 && (!item?.is_active || quantity > item.available)) return
    const update = lines => quantity === 0 && !editing ? lines.filter(l => l.item_id !== itemId) : lines.some(l => l.item_id === itemId) ? lines.map(l => l.item_id === itemId ? { ...l, quantity } : l) : [...lines, { item_id: itemId, quantity }]
    if (quantity > 0 && !cart.some(l => l.item_id === itemId) && cart.length >= 30) return
    setCart(update)
    if (modal === 'submit') setForm(f => ({ ...f, lines: update(f.lines) }))
  }
  const startRequest = () => open('submit', { id: crypto.randomUUID(), purpose: '', pickup_date: malaysiaToday(), due_date: '', ...draft, lines: cart.map(l => ({ ...l })) })
  const cartQuantity = cart.reduce((sum, line) => sum + Math.max(0, Number(line.quantity) || 0), 0)
  const invalidCart = !cart.length || cart.some(line => { const item = items.find(i => i.id === line.item_id); return !item?.is_active || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > item.available })
  const selectedRequest = modal === 'detail' ? requests.find(r => r.id === form.id) || form : form.request
  const visibleItems = items.filter(i => (showInactive || i.is_active) && (!category || i.category_id === category) && `${i.name} ${i.asset_code || ''} ${i.location}`.toLowerCase().includes(search.toLowerCase()))
  const modeName = mode => mode === 'loan' ? t('借还制', 'Returnable') : t('领用制', 'Consumable')
  const switchTab = next => { setTab(next); setPage(0) }
  const operationForm = (action, request) => open(action, { id: request.id, request, note: '', lines: request.inventory_request_lines.filter(l => outstanding(l) > 0).map(l => ({ id: l.id, name: l.item_name, mode: l.mode, remaining: outstanding(l), good: 0, damaged: 0, lost: 0 })) })
  const canDecide = request => canApprove && (request.applicant_id !== currentUserProfile.id || teacher)
  const count = tab === 'history' ? movementCount : requestCount

  return <div className="inventory-page">
    <header className="inv-header"><div><h1><Package size={26} />{management ? t('物品管理', 'Inventory Management') : t('物品与借用', 'Inventory & Borrowing')}</h1><p>{management ? t('库存、申请处理与出入库记录', 'Stock, request processing and movements') : t('学会物品目录与我的借用记录', 'Club catalogue and my borrowing records')}</p></div>
      <div className="inv-actions">{management ? <a className="inv-link" href="#/inventory">{t('返回物品与借用', 'Back to borrowing')}</a> : hasManagementAccess && <a className="inv-link" href="#/inventory-management"><Settings size={17} />{t('物品管理', 'Manage inventory')}</a>}<button onClick={load} disabled={busy} title={t('刷新', 'Refresh')} aria-label={t('刷新', 'Refresh')} className="inv-icon"><RefreshCw size={19} /></button></div></header>
    {error && <div role="alert" className="inv-error">{error}</div>}
    <nav className="inv-tabs" aria-label={t('物品管理分页', 'Inventory sections')}>
      {[...(!management || canManage ? [['items', management ? t('库存管理', 'Stock management') : t('物品目录', 'Catalogue')]] : []), ['requests', management ? t('申请处理', 'Request processing') : t('我的申请', 'My requests')], ...(canReview ? [['history', t('出入库记录', 'Stock history')]] : []), ...(canManage ? [['categories', t('分类管理', 'Categories')]] : [])].map(([key, title]) => <button key={key} aria-current={tab === key ? 'page' : undefined} onClick={() => switchTab(key)}>{title}</button>)}
    </nav>
    {loading ? <div className="inv-skeleton" role="status" aria-label={t('加载中', 'Loading')}>{[1, 2, 3].map(n => <div key={n} />)}</div> : <>
      {tab === 'items' && <>
        <div className="inv-toolbar"><div className="inv-search"><Search size={18} /><input aria-label={t('搜索物品', 'Search items')} placeholder={t('名称、编号、位置', 'Name, code, location')} value={search} onChange={e => setSearch(e.target.value)} /></div>
          <select aria-label={t('分类筛选', 'Category filter')} value={category} onChange={e => setCategory(e.target.value)}><option value="">{t('所有分类', 'All categories')}</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          {canManage && <label className="inv-check"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />{t('包括停用物品', 'Include inactive')}</label>}
          {!management && <button className="inv-primary" onClick={startRequest} disabled={!cart.length}><ShoppingCart size={17} />{t('借用清单', 'Borrowing list')} ({cart.length})</button>}
          {canManage && <button onClick={() => open('item', { ...EMPTY_ITEM, category_id: categories.find(c => c.is_active)?.id || '', unit: t('件', 'pcs') })}><Plus size={17} />{t('新增物品', 'Add item')}</button>}
        </div>
        {!visibleItems.length && <p className="inv-empty">{t('暂无物品', 'No items found')}</p>}
        {[...new Set(visibleItems.map(item => item.category_id))].map(categoryId => <section className="inv-category-section" key={categoryId || 'uncategorised'}>
          <h2 className="inv-category-heading"><Tag size={22} />{categories.find(c => c.id === categoryId)?.name || t('未分类', 'Uncategorised')}<span>{visibleItems.filter(item => item.category_id === categoryId).length}</span></h2>
        <div className="inv-catalogue">{visibleItems.filter(item => item.category_id === categoryId).map(item => <article className="inv-item" key={item.id}>
          <div className="inv-photo-frame"><div className="inv-item-photo">{item.photo_url ? <img src={item.photo_url} alt={item.name} loading="lazy" /> : <div className="inv-photo-placeholder"><Package size={38} /><span>{t('暂无照片', 'No photo')}</span></div>}</div></div>
          <div className="inv-category-label"><Tag size={13} /><span>{categories.find(c => c.id === item.category_id)?.name || t('未分类', 'Uncategorised')}</span></div>
          <div className="inv-item-body"><div className="inv-item-title"><h2>{item.name}</h2>{!item.is_active && <span className="inv-badge">{t('已停用', 'Inactive')}</span>}</div>
            <p>{modeName(item.mode)}{item.asset_code && ` · ${item.asset_code}`}</p>
            <p>{t('位置', 'Location')}: {item.location || '—'}</p>
            <div className="inv-counts"><span><strong>{item.available}</strong>{t('可用', 'Available')}</span><span><strong>{item.reserved}</strong>{t('预留', 'Reserved')}</span><span><strong>{item.on_loan}</strong>{t('借出', 'On loan')}</span><span><strong>{item.damaged}</strong>{t('损坏', 'Damaged')}</span><span><strong>{item.lost}</strong>{t('遗失', 'Lost')}</span></div>
            <p>{t('登记总数', 'Recorded total')}: {item.available + item.reserved + item.on_loan + item.damaged + item.lost} {item.unit}</p>{item.notes && <p className="inv-note">{item.notes}</p>}
            <div className="inv-actions inv-item-controls">{!management && (cart.some(l => l.item_id === item.id) ? <div className="inv-stepper" aria-label={`${item.name} ${t('数量', 'Quantity')}`}><button title={t('减少数量', 'Decrease quantity')} aria-label={`${t('减少', 'Decrease')} ${item.name}`} onClick={() => setQuantity(item.id, cart.find(l => l.item_id === item.id).quantity - 1)}><Minus size={16} /></button><strong aria-live="polite">{cart.find(l => l.item_id === item.id).quantity}</strong><button title={t('增加数量', 'Increase quantity')} aria-label={`${t('增加', 'Increase')} ${item.name}`} disabled={!item.is_active || cart.find(l => l.item_id === item.id).quantity >= item.available} onClick={() => setQuantity(item.id, cart.find(l => l.item_id === item.id).quantity + 1)}><Plus size={16} /></button></div> : <button className="inv-primary" disabled={!item.is_active || item.available < 1 || cart.length >= 30} onClick={() => setQuantity(item.id, 1)}><ShoppingCart size={17} />{t('加入清单', 'Add to list')}</button>)}
              {canManage && <><button title={t('编辑物品', 'Edit item')} aria-label={t('编辑物品', 'Edit item')} onClick={() => open('item', { ...item, quantity: undefined })}><Pencil size={17} /></button><button onClick={() => open('adjust', { id: item.id, name: item.name, available: 0, damaged: 0, lost: 0, note: '' })}>{t('入库 / 盘点', 'Stock adjustment')}</button></>}
            </div>
          </div>
          </article>)}</div></section>)}
      </>}
      {tab === 'requests' && <>
        <div className="inv-toolbar">
          <select aria-label={t('状态筛选', 'Status filter')} value={status} onChange={e => { setStatus(e.target.value); setPage(0) }}><option value="">{t('所有状态', 'All statuses')}</option>{Object.entries(statusLabels).map(([value, text]) => <option key={value} value={value}>{label(text)}</option>)}<option value="overdue">{t('逾期未归还', 'Overdue')}</option></select>
          {!management && <button className="inv-primary" onClick={() => switchTab('items')}><ShoppingCart size={17} />{t('选择物品', 'Browse items')}</button>}
        </div>
        {requests.length === 0 && <p className="inv-empty">{t('暂无申请', 'No requests')}</p>}
        <div className="inv-rows">{requests.map(request => <button className="inv-request" key={request.id} onClick={() => open('detail', request)}>
          <div><strong>{request.applicant_name}</strong><p>{request.purpose}</p><small>{request.pickup_date}{request.due_date && ` → ${request.due_date}`} · #{request.id.slice(0, 8)}</small></div>
          <div><span className={`inv-badge ${request.status}`}>{label(statusLabels[request.status])}</span>{isOverdue(request) && <span className="inv-badge overdue">{t('逾期未归还', 'Overdue')}</span>}</div>
        </button>)}</div>
      </>}
      {tab === 'categories' && canManage && <>
        <div className="inv-toolbar"><button className="inv-primary" onClick={() => open('category', { name: '', is_active: true })}><Plus size={17} />{t('新增分类', 'Add category')}</button></div>
        {!categories.length && <p className="inv-empty">{t('尚未建立分类', 'No categories yet')}</p>}
        <div className="inv-rows">{categories.map(c => <div key={c.id} className="inv-category"><span>{c.name} {!c.is_active && <small>{t('已停用', 'Inactive')}</small>}</span><button aria-label={t('编辑分类', 'Edit category')} title={t('编辑分类', 'Edit category')} onClick={() => open('category', c)}><Pencil size={17} /></button></div>)}</div>
      </>}
      {tab === 'history' && canReview && <div className="inv-rows">
        {!movements.length && <p className="inv-empty">{t('暂无库存记录', 'No stock movements')}</p>}
        {movements.map(m => <article className="inv-history" key={m.id}><div><strong>{m.inventory_items?.name || '—'}</strong><span>{actionLabels[m.action] ? label(actionLabels[m.action]) : m.action} · {m.quantity}</span></div><p>{m.actor_name} · {new Date(m.created_at).toLocaleString(zh ? 'zh-CN' : 'en-GB')}</p><p>{m.note}</p>{m.request_id && <small>#{m.request_id.slice(0, 8)}</small>}</article>)}
      </div>}
      {['requests', 'history'].includes(tab) && <div className="inv-pagination"><button aria-label={t('上一页', 'Previous page')} disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft size={18} /></button><span>{page + 1} / {Math.max(1, Math.ceil(count / PAGE_SIZE))}</span><button aria-label={t('下一页', 'Next page')} disabled={(page + 1) * PAGE_SIZE >= count} onClick={() => setPage(p => p + 1)}><ChevronRight size={18} /></button></div>}
    </>}

    {!management && cart.length > 0 && <aside className="inv-cart-bar" aria-label={t('借用清单摘要', 'Borrowing list summary')}><div><strong><ShoppingCart size={19} />{t('借用清单', 'Borrowing list')}</strong><p aria-live="polite">{t(`${cart.length} 种物品 · 数量 ${cartQuantity}`, `${cart.length} item types · ${cartQuantity} units`)}</p>{cart.length >= 30 && <small>{t('每次最多 30 种物品', 'Up to 30 item types per request')}</small>}</div><button className="inv-primary" onClick={startRequest}>{t('查看清单并申请', 'Review and request')}<ChevronRight size={17} /></button></aside>}
    <dialog className="inv-dialog" ref={dialogRef} onCancel={e => { e.preventDefault(); close() }}>
      {modal && <><header><h2>{modal === 'detail' ? t('申请详情', 'Request details') : modal === 'category' ? t('物品分类', 'Item category') : modal === 'item' ? t('物品档案', 'Item details') : label(actionLabels[modal])}</h2><button className="inv-icon" type="button" aria-label={t('关闭', 'Close')} onClick={close} disabled={busy}><X size={20} /></button></header>
        {error && <div className="inv-error" role="alert">{error}</div>}
        {modal === 'detail' ? selectedRequest && <div className="inv-form">
          <p><strong>{selectedRequest.applicant_name}</strong> · {label(statusLabels[selectedRequest.status])}</p><p className="inv-note">{selectedRequest.purpose}</p><p>{t('领取', 'Collection')}: {selectedRequest.pickup_date} · {t('归还', 'Return')}: {selectedRequest.due_date || '—'}</p>
          {selectedRequest.review_note && <p>{t('审批备注', 'Review note')}: {selectedRequest.review_note}</p>}
          {selectedRequest.inventory_request_lines.map(l => <div className="inv-line" key={l.id}><strong>{l.item_name} × {l.quantity}</strong><p>{modeName(l.mode)} · {t('已归还', 'Returned')} {l.returned} · {t('损坏', 'Damaged')} {l.damaged} · {t('遗失', 'Lost')} {l.lost}</p>{l.mode === 'loan' && <p>{t('未归还', 'Outstanding')}: {outstanding(l)}</p>}</div>)}
          <div className="inv-actions">
            {selectedRequest.status === 'pending' && canDecide(selectedRequest) && <><button className="inv-primary" onClick={() => operationForm('approve', selectedRequest)}>{t('批准', 'Approve')}</button><button onClick={() => operationForm('reject', selectedRequest)}>{t('拒绝', 'Reject')}</button></>}
            {['pending', 'approved'].includes(selectedRequest.status) && (selectedRequest.applicant_id === currentUserProfile.id || canManage) && <button onClick={() => operationForm('cancel', selectedRequest)}>{t('取消申请', 'Cancel request')}</button>}
            {canManage && selectedRequest.status === 'approved' && <button className="inv-primary" onClick={() => operationForm('issue', selectedRequest)}>{t('确认已领取', 'Confirm collection')}</button>}
            {canManage && ['issued', 'closed'].includes(selectedRequest.status) && selectedRequest.inventory_request_lines.some(l => outstanding(l) > 0) && <button className="inv-primary" onClick={() => operationForm('return', selectedRequest)}>{t('归还验收 / 退库', 'Accept return')}</button>}
          </div>
        </div> : <form className="inv-form" onSubmit={e => { e.preventDefault(); run(modal, modal === 'return' ? { ...form, lines: form.lines.filter(l => Number(l.good) + Number(l.damaged) + Number(l.lost) > 0) } : form) }}>
          {modal === 'category' && <><Field label={t('分类名称', 'Category name')}><input required maxLength={80} value={form.name} onChange={e => change('name', e.target.value)} /></Field>{form.id && <label className="inv-check"><input type="checkbox" checked={form.is_active} onChange={e => change('is_active', e.target.checked)} />{t('启用分类', 'Active category')}</label>}</>}
          {modal === 'item' && <>
            <Field label={t('物品名称', 'Item name')}><input required maxLength={160} value={form.name} onChange={e => change('name', e.target.value)} /></Field>
            <div className="inv-form-grid"><Field label={t('分类', 'Category')}><select required value={form.category_id} onChange={e => change('category_id', e.target.value)}><option value="">{t('请选择', 'Select')}</option>{categories.filter(c => c.is_active || c.id === form.category_id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
              <Field label={t('管理方式', 'Management mode')}><select value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value, asset_code: e.target.value === 'consumable' ? '' : f.asset_code }))}><option value="loan">{t('借还制', 'Returnable')}</option><option value="consumable">{t('领用制', 'Consumable')}</option></select></Field></div>
            <Field label={t('独立编号（选填，一件一号）', 'Asset code (optional, one unit per code)')}><input value={form.asset_code || ''} onChange={e => change('asset_code', e.target.value)} disabled={form.mode !== 'loan'} maxLength={80} /></Field>
            <div className="inv-form-grid"><Field label={t('单位', 'Unit')}><input required value={form.unit} maxLength={30} onChange={e => change('unit', e.target.value)} /></Field>{!form.id && <Field label={t('初始数量', 'Opening quantity')}><input required type="number" min="0" step="1" max={form.asset_code ? 1 : 1000000} value={form.quantity} onChange={e => change('quantity', Number(e.target.value))} /></Field>}</div>
            <Field label={t('存放位置', 'Storage location')}><input value={form.location} maxLength={200} onChange={e => change('location', e.target.value)} /></Field>
            <Field label={t('状况及备注', 'Condition and notes')}><textarea value={form.notes} maxLength={2000} onChange={e => change('notes', e.target.value)} /></Field>
            <Field label={<><ImagePlus size={16} />{t('物品照片（最大 5MB）', 'Photo (up to 5MB)')}</>}><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setPhoto(e.target.files?.[0] || null)} /></Field>
            {form.photo_path && <label className="inv-check"><input type="checkbox" checked={false} onChange={() => change('photo_path', '')} />{t('移除现有照片', 'Remove existing photo')}</label>}
            {form.id && <label className="inv-check"><input type="checkbox" checked={form.is_active} onChange={e => change('is_active', e.target.checked)} />{t('启用物品', 'Active item')}</label>}
          </>}
          {modal === 'adjust' && <><p><strong>{form.name}</strong></p><p>{t('输入变动数量：入库填正数，减少填负数；维修完毕请增加可用数并减少损坏数。', 'Enter changes: positive to add, negative to remove. For repairs, increase available and decrease damaged.')}</p>
            <div className="inv-form-grid">{[['available', t('可用变动', 'Available change')], ['damaged', t('损坏变动', 'Damaged change')], ['lost', t('遗失变动', 'Lost change')]].map(([key, title]) => <Field key={key} label={title}><input required type="number" step="1" value={form[key]} onChange={e => change(key, Number(e.target.value))} /></Field>)}</div>
          </>}
          {modal === 'submit' && <>
            {!form.lines.length && <p className="inv-empty">{t('清单为空', 'Your list is empty')}</p>}
            {form.lines.map(line => { const item = items.find(i => i.id === line.item_id); return <div className="inv-cart-line" key={line.item_id}>
              <div className="inv-cart-thumb">{item?.photo_url ? <img src={item.photo_url} alt="" /> : <Package size={24} />}</div>
              <div className="inv-cart-name"><strong>{item?.name || t('物品已不可用', 'Item unavailable')}</strong><small>{item?.asset_code} {categories.find(c => c.id === item?.category_id)?.name}</small><small>{t('可用', 'Available')}: {item?.available || 0} {item?.unit}</small>{(!item?.is_active || line.quantity > item.available) && <span className="inv-cart-warning">{t('库存已变动，请调整数量或移除', 'Stock changed. Adjust quantity or remove this item.')}</span>}</div>
              <Field label={t('数量', 'Quantity')}><input required disabled={busy} aria-label={`${item?.name || ''} ${t('数量', 'Quantity')}`} type="number" min="1" max={item?.available || 0} step="1" value={line.quantity} onChange={e => setQuantity(line.item_id, e.target.value === '' ? '' : Number(e.target.value), true)} /></Field>
              <button type="button" disabled={busy} title={t('移除物品', 'Remove item')} aria-label={`${t('移除', 'Remove')} ${item?.name || ''}`} onClick={() => setQuantity(line.item_id, 0)}><X size={17} /></button>
            </div> })}
            <button type="button" disabled={busy} onClick={() => { close(); switchTab('items') }}><Plus size={17} />{t('继续选择物品', 'Continue browsing')}</button>
            <Field label={t('用途', 'Purpose')}><textarea required maxLength={2000} value={form.purpose} onChange={e => change('purpose', e.target.value)} /></Field>
            <div className="inv-form-grid"><Field label={t('领取日期', 'Collection date')}><input required type="date" min={malaysiaToday()} value={form.pickup_date} onChange={e => change('pickup_date', e.target.value)} /></Field><Field label={t('预计归还日期（借还物品必填）', 'Return date (required for loans)')}><input type="date" min={form.pickup_date} required={form.lines.some(l => items.find(i => i.id === l.item_id)?.mode === 'loan')} value={form.due_date} onChange={e => change('due_date', e.target.value)} /></Field></div>
          </>}
          {['approve', 'reject', 'cancel', 'issue'].includes(modal) && <><p><strong>{form.request.applicant_name}</strong> · {form.request.purpose}</p>{form.request.inventory_request_lines.map(l => <p key={l.id}>{l.item_name} × {l.quantity}</p>)}</>}
          {modal === 'return' && form.lines.map((line, index) => <div className="inv-line" key={line.id}><strong>{line.name}</strong><p>{t('最多可登记', 'Maximum to record')}: {line.remaining}</p><div className="inv-form-grid">{[['good', t('完好归还 / 退库', 'Returned in good condition')], ...(line.mode === 'loan' ? [['damaged', t('损坏', 'Damaged')], ['lost', t('遗失', 'Lost')]] : [])].map(([key, title]) => <Field key={key} label={title}><input type="number" required min="0" max={line.remaining} step="1" value={line[key]} onChange={e => change('lines', form.lines.map((l, n) => n === index ? { ...l, [key]: Number(e.target.value) } : l))} /></Field>)}</div></div>)}
          {['adjust', 'approve', 'reject', 'cancel', 'issue', 'return'].includes(modal) && <Field label={t('处理备注', 'Processing note')}><textarea required={['adjust', 'reject'].includes(modal) || (modal === 'return' && form.lines.some(l => l.damaged > 0 || l.lost > 0))} maxLength={2000} value={form.note} onChange={e => change('note', e.target.value)} /></Field>}
          <footer><button type="button" disabled={busy} onClick={close}>{t('取消', 'Cancel')}</button><button className="inv-primary" type="submit" disabled={busy || (modal === 'submit' && invalidCart)}>{busy && <Loader size={17} className="inv-spin" />}{busy ? t('处理中…', 'Processing…') : t('确认', 'Confirm')}</button></footer>
        </form>}
      </>}
    </dialog>
  </div>
}
