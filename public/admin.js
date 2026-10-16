const $ = id => document.getElementById(id);
const API = 'https://cawroeqwtuxfmaqxuypd.supabase.co/functions/v1/course-api';
let orders = [];
let activeStatus = 'all';
let activeView = 'overview';
let currentPage = 1;
let token = sessionStorage.getItem('courseAdminToken') || '';
const orderStatuses = [['new', 'جديدة'], ['confirmed', 'مؤكدة'], ['rejected', 'مرفوضة']];
const messageTemplates = {
  confirm: 'السلام عليكم {name}، نؤكد استلام طلبيتك رقم #{id} من بسكريا للتوابل. الكمية: {quantity}. سنتواصل معك لتأكيد التوصيل. شكرًا لثقتك بنا.',
  delivery: 'السلام عليكم {name}، نرجو تأكيد عنوان التوصيل لطلبيتك رقم #{id}: {address}، ولاية {wilaya}. شكرًا لك.',
  followup: 'السلام عليكم {name}، نتواصل معك بخصوص طلبيتك رقم #{id} من بسكريا للتوابل. هل ما زلت ترغب في تأكيدها؟'
};

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = new URL(API);
  url.searchParams.set('route', path);
  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) { token = ''; sessionStorage.removeItem('courseAdminToken'); $('dashboard').hidden = true; $('login').hidden = false; $('admin-login-nav').hidden = false; orders = []; $('rows').replaceChildren(); $('ordersMobile').replaceChildren(); }
    throw Error(data.error || 'تعذر تنفيذ الطلب.');
  }
  return data;
}

function addCell(row, label, value, className = '') {
  const cell = document.createElement('td'); cell.dataset.label = label; cell.textContent = value || '—'; if (className) cell.className = className; row.append(cell);
}
function dateLabel(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('ar-DZ'); }
function viewTitle(view) { return ({ overview: 'نظرة عامة', orders: 'الطلبات', settings: 'محتوى الباك' })[view] || 'نظرة عامة'; }
function setAdminView(view) {
  activeView = view;
  document.querySelectorAll('[data-view-panel]').forEach(panel => { panel.hidden = panel.dataset.viewPanel !== view; });
  document.querySelectorAll('[data-admin-view]').forEach(button => {
    const active = button.dataset.adminView === view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current');
  });
  $('adminPageTitle').textContent = viewTitle(view);
  $('pageCrumb').textContent = viewTitle(view);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderOverview(countByStatus) {
  const total = orders.length;
  $('statTotal').textContent = total.toLocaleString('ar-DZ');
  $('statNew').textContent = countByStatus.new.toLocaleString('ar-DZ');
  $('statConfirmed').textContent = countByStatus.confirmed.toLocaleString('ar-DZ');
  $('statRejected').textContent = countByStatus.rejected.toLocaleString('ar-DZ');
  $('overviewNew').textContent = countByStatus.new.toLocaleString('ar-DZ');
  $('overviewConfirmed').textContent = countByStatus.confirmed.toLocaleString('ar-DZ');
  $('overviewRejected').textContent = countByStatus.rejected.toLocaleString('ar-DZ');
  $('sideCount').textContent = total.toLocaleString('ar-DZ');
  for (const status of ['new', 'confirmed', 'rejected']) {
    const amount = countByStatus[status];
    $(`meter${status[0].toUpperCase()}${status.slice(1)}`).style.width = `${total ? Math.round(amount / total * 100) : 0}%`;
  }
  const recent = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
  const list = $('recentOrders');
  if (!recent.length) {
    const empty = document.createElement('p'); empty.className = 'recent-empty'; empty.textContent = 'ستظهر هنا أحدث الطلبات عند وصولها.'; list.replaceChildren(empty); return;
  }
  const fragment = document.createDocumentFragment();
  for (const order of recent) {
    const item = document.createElement('div'); item.className = 'recent-order';
    const icon = document.createElement('span'); icon.className = 'recent-avatar'; icon.setAttribute('aria-hidden', 'true'); icon.textContent = (order.fullName || 'ط').trim().slice(0, 1);
    const copy = document.createElement('span'); copy.className = 'recent-copy';
    const name = document.createElement('strong'); name.textContent = order.fullName || `الطلب #${order.id}`;
    const meta = document.createElement('small'); meta.textContent = `#${order.id} · ${dateLabel(order.createdAt)}`; copy.append(name, meta);
    const status = document.createElement('span'); status.className = `recent-status status-${order.status || 'new'}`; status.textContent = orderStatuses.find(item => item[0] === (order.status || 'new'))?.[1] || 'جديدة';
    item.append(icon, copy, status); fragment.append(item);
  }
  list.replaceChildren(fragment);
}

function makeStatusControl(order) {
  const control = document.createElement('div'); control.className = 'order-status-control';
  const select = document.createElement('select'); select.setAttribute('aria-label', `حالة الطلب رقم ${order.id}`);
  for (const [value, text] of orderStatuses) { const option = document.createElement('option'); option.value = value; option.textContent = text; select.append(option); }
  select.value = order.status || 'new';
  select.addEventListener('change', async () => {
    const previous = order.status || 'new', next = select.value;
    select.disabled = true;
    try {
      await api('order-status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id, status: next }) });
      order.status = next; renderOrders(); $('adminStatus').textContent = `تم تحديث حالة الطلب #${order.id} إلى «${orderStatuses.find(item => item[0] === next)[1]}».`;
    } catch (error) { select.value = previous; $('adminStatus').textContent = error.message; }
    finally { select.disabled = false; }
  });
  control.append(select); return control;
}

function makeDeleteButton(order) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'delete-order'; button.textContent = 'حذف الطلب'; button.setAttribute('aria-label', `حذف الطلب رقم ${order.id}`);
  button.addEventListener('click', async () => {
    if (!window.confirm(`هل تريد حذف الطلب #${order.id} نهائيًا؟ لا يمكن التراجع عن هذا الحذف.`)) return;
    button.disabled = true;
    try {
      await api('order-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: order.id }) });
      orders = orders.filter(item => item.id !== order.id); renderOrders(); $('adminStatus').textContent = `تم حذف الطلب #${order.id} نهائيًا.`;
    } catch (error) { button.disabled = false; $('adminStatus').textContent = error.message; }
  });
  return button;
}

function makeEditButton(order) {
  const button = document.createElement('button'); button.type = 'button'; button.className = 'edit-order'; button.textContent = 'تعديل'; button.setAttribute('aria-label', `تعديل بيانات الطلب رقم ${order.id}`);
  button.addEventListener('click', () => {
    const form = $('editOrderForm');
    form.elements.orderId.value = order.id;
    form.elements.fullName.value = order.fullName || '';
    form.elements.phone.value = order.phone || '';
    form.elements.wilaya.value = order.wilaya || '';
    form.elements.address.value = order.address || '';
    form.elements.quantity.value = order.quantity || 1;
    form.elements.notes.value = order.notes || '';
    form.elements.status.value = order.status || 'new';
    $('editOrderNumber').textContent = `الطلب #${order.id}`;
    $('editOrderDialog').showModal();
  });
  return button;
}

function makeOrderActions(order) {
  const actions = document.createElement('div'); actions.className = 'order-actions';
  const phone = String(order.phone || '').replace(/[^\d+]/g, '');
  const digits = phone.replace(/\D/g, '');
  if (digits) {
    const call = document.createElement('a'); call.className = 'contact-order call-order'; call.href = `tel:${phone}`; call.setAttribute('aria-label', `اتصال بالزبون صاحب الطلب ${order.id}`); call.title = 'اتصال'; call.textContent = '☎';
    let international = digits;
    if (international.startsWith('0')) international = `213${international.slice(1)}`;
    else if (!international.startsWith('213') && international.length <= 10) international = `213${international}`;
    const text = `السلام عليكم ${order.fullName || ''}، نؤكد استلام طلبيتك رقم #${order.id} من بسكريا للتوابل. الكمية: ${order.quantity || 1}.`;
    const whatsapp = document.createElement('a'); whatsapp.className = 'contact-order whatsapp-order'; whatsapp.href = `https://wa.me/${international}?text=${encodeURIComponent(text)}`; whatsapp.target = '_blank'; whatsapp.rel = 'noopener noreferrer'; whatsapp.setAttribute('aria-label', `فتح واتساب للطلب ${order.id}`); whatsapp.title = 'واتساب'; whatsapp.textContent = '◉';
    actions.append(whatsapp, call);
  }
  actions.append(makeEditButton(order), makeDeleteButton(order));
  return actions;
}

function getVisibleOrders() {
  const query = $('search').value.trim().toLocaleLowerCase('ar');
  const from = $('dateFrom').value, to = $('dateTo').value;
  const visible = orders.filter(order => {
    const parsedDate = new Date(order.createdAt);
    const orderDate = Number.isNaN(parsedDate.valueOf()) ? '' : parsedDate.toISOString().slice(0, 10);
    return (activeStatus === 'all' || (order.status || 'new') === activeStatus)
      && (!from || orderDate >= from) && (!to || orderDate <= to)
      && (!$('filterWilaya').value || order.wilaya === $('filterWilaya').value)
      && Object.values(order).some(value => String(value ?? '').toLocaleLowerCase('ar').includes(query));
  });
  return visible.sort((a, b) => {
    if ($('sortOrders').value === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if ($('sortOrders').value === 'quantity') return (Number(b.quantity) || 0) - (Number(a.quantity) || 0);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function renderWilayaOptions() {
  const select = $('filterWilaya'), previous = select.value;
  const wilayas = [...new Set(orders.map(order => String(order.wilaya || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
  select.replaceChildren(new Option('كل الولايات', ''), ...wilayas.map(wilaya => new Option(wilaya, wilaya)));
  select.value = wilayas.includes(previous) ? previous : '';
}

function renderOrders() {
  const countByStatus = Object.fromEntries(orderStatuses.map(([status]) => [status, orders.filter(order => (order.status || 'new') === status).length]));
  $('countNew').textContent = countByStatus.new; $('countConfirmed').textContent = countByStatus.confirmed; $('countRejected').textContent = countByStatus.rejected; $('countAll').textContent = orders.length;
  renderOverview(countByStatus);
  renderWilayaOptions();
  const sorted = getVisibleOrders();
  const pageSizeValue = $('pageSize').value;
  const pageSize = pageSizeValue === 'all' ? Math.max(sorted.length, 1) : Number(pageSizeValue) || 25;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  currentPage = Math.min(Math.max(currentPage, 1), pageCount);
  const pageOrders = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const query = $('search').value.trim();
  $('count').textContent = `${sorted.length.toLocaleString('ar-DZ')} من ${orders.length.toLocaleString('ar-DZ')} طلب`;
  $('clearSearch').hidden = !query;
  document.querySelectorAll('.status-filter').forEach(button => { const active = button.dataset.status === activeStatus; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
  const rows = document.createDocumentFragment(), cards = document.createDocumentFragment();
  if (!pageOrders.length) {
    const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 10; cell.className = 'empty-orders'; cell.textContent = orders.length ? 'لا توجد طلبات في هذا القسم تطابق البحث.' : 'لم يصل أي طلب بعد. ستظهر الطلبات الجديدة هنا.'; row.append(cell); rows.append(row);
    const empty = document.createElement('div'); empty.className = 'order-card empty-orders'; empty.textContent = cell.textContent; cards.append(empty);
  } else for (const order of pageOrders) {
    const row = document.createElement('tr');
    addCell(row, 'رقم', `#${order.id}`); addCell(row, 'الاسم الكامل', order.fullName); addCell(row, 'الهاتف', order.phone, 'ltr'); addCell(row, 'الولاية', order.wilaya); addCell(row, 'عنوان التوصيل', order.address); addCell(row, 'الكمية', String(order.quantity)); addCell(row, 'ملاحظة', order.notes); const statusCell = document.createElement('td'); statusCell.dataset.label = 'الحالة'; statusCell.append(makeStatusControl(order)); row.append(statusCell); addCell(row, 'وقت الطلب', dateLabel(order.createdAt)); const actionCell = document.createElement('td'); actionCell.dataset.label = 'إجراء'; actionCell.append(makeOrderActions(order)); row.append(actionCell); rows.append(row);
    const card = document.createElement('article'); card.className = 'order-card';
    const head = document.createElement('div'); head.className = 'order-card-head';
    const name = document.createElement('strong'); name.textContent = order.fullName || 'طلب جديد';
    const id = document.createElement('span'); id.textContent = `#${order.id} · ${dateLabel(order.createdAt)}`; head.append(name, id);
    const details = document.createElement('dl');
    for (const [label, value, className] of [['الهاتف',order.phone,'ltr'],['الولاية',order.wilaya,''],['عنوان التوصيل',order.address,'order-address'],['الكمية',String(order.quantity),''],['ملاحظة',order.notes,'order-notes']]) {
      const item = document.createElement('div'); if (className) item.className = className;
      const term = document.createElement('dt'); term.textContent = label; const description = document.createElement('dd'); description.textContent = value || '—'; if (className === 'ltr') description.dir = 'ltr'; item.append(term, description); details.append(item);
    }
    card.append(head, details, makeStatusControl(order), makeOrderActions(order)); cards.append(card);
  }
  $('rows').replaceChildren(rows); $('ordersMobile').replaceChildren(cards);
  $('pageIndicator').textContent = `${currentPage.toLocaleString('ar-DZ')} / ${pageCount.toLocaleString('ar-DZ')}`;
  $('previousPage').disabled = currentPage <= 1;
  $('nextPage').disabled = currentPage >= pageCount;
  $('ordersPagination').hidden = sorted.length <= pageSize;
  const updated = new Date().toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });
  $('lastUpdated').textContent = `آخر تحديث ${updated}`;
  $('adminStatus').textContent = `يعرض ${pageOrders.length.toLocaleString('ar-DZ')} من ${sorted.length.toLocaleString('ar-DZ')} طلب`;
}

function exportOrders() {
  const columns = [
    ['رقم الطلب', order => `#${order.id}`], ['الاسم الكامل', order => order.fullName],
    ['رقم الهاتف', order => order.phone], ['الولاية', order => order.wilaya],
    ['عنوان التوصيل', order => order.address], ['الكمية', order => order.quantity],
    ['ملاحظات', order => order.notes],
    ['الحالة', order => orderStatuses.find(item => item[0] === (order.status || 'new'))?.[1] || 'جديدة'],
    ['وقت الطلب', order => dateLabel(order.createdAt)],
  ];
  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const selected = getVisibleOrders();
  const content = '\uFEFF' + [columns.map(([label]) => csvCell(label)).join(','), ...selected.map(order => columns.map(([, value]) => csvCell(value(order))).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'طلبيات-بسكريا-للتوابل.csv'; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('adminStatus').textContent = `تم تجهيز ملف يتضمن ${selected.length.toLocaleString('ar-DZ')} طلب حسب الفلاتر الحالية.`;
}

async function loadOrders() { orders = await api('orders'); renderOrders(); $('login').hidden = true; $('admin-login-nav').hidden = true; $('dashboard').hidden = false; setAdminView(activeView); }

function addMediaEntry(item = {}) {
  const card = document.createElement('article'); card.className = 'media-editor-card';
  const top = document.createElement('div'); top.className = 'media-editor-top';
  const heading = document.createElement('strong'); heading.textContent = 'مقطع جديد';
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-media'; remove.textContent = 'حذف المقطع'; remove.setAttribute('aria-label', 'حذف هذا المقطع'); remove.addEventListener('click', () => card.remove()); top.append(heading, remove);
  const fields = document.createElement('div'); fields.className = 'media-editor-fields';
  const typeLabel = document.createElement('label'); typeLabel.textContent = 'نوع المقطع';
  const type = document.createElement('select'); type.dataset.field = 'kind'; type.setAttribute('aria-label','نوع المقطع');
  for (const [value, label] of [['video','فيديو'],['audio','مقطع صوتي']]) { const option = document.createElement('option'); option.value = value; option.textContent = label; type.append(option); }
  type.value = item.kind === 'audio' ? 'audio' : 'video'; typeLabel.append(type);
  const titleLabel = document.createElement('label'); titleLabel.textContent = 'عنوان المقطع';
  const title = document.createElement('input'); title.type = 'text'; title.maxLength = 200; title.required = true; title.placeholder = type.value === 'audio' ? 'مثال: طريقة استعمال الخلطة' : 'مثال: تعرّف على الباك'; title.value = item.title || ''; title.dataset.field = 'title'; titleLabel.append(title);
  type.addEventListener('change', () => { title.placeholder = type.value === 'audio' ? 'مثال: طريقة استعمال الخلطة' : 'مثال: تعرّف على الباك'; url.placeholder = type.value === 'audio' ? 'رابط ملف صوتي أو Google Drive' : 'رابط YouTube أو Google Drive'; });
  const urlLabel = document.createElement('label'); urlLabel.textContent = 'رابط المقطع';
  const url = document.createElement('input'); url.type = 'url'; url.inputMode = 'url'; url.dir = 'ltr'; url.required = true; url.placeholder = type.value === 'audio' ? 'رابط ملف صوتي أو Google Drive' : 'رابط YouTube أو Google Drive'; url.value = item.url || ''; url.dataset.field = 'url'; urlLabel.append(url);
  fields.append(typeLabel, titleLabel, urlLabel); card.append(top, fields); $('mediaEditor').append(card);
}

function readMediaEntries() {
  return [...$('mediaEditor').querySelectorAll('.media-editor-card')].map(card => ({
    kind: card.querySelector('[data-field="kind"]').value,
    title: card.querySelector('[data-field="title"]').value.trim(),
    url: card.querySelector('[data-field="url"]').value.trim(),
  }));
}

async function loadSettings() {
  const data = await api('settings');
  const form = $('settingsForm'); form.elements.title.value = data.title || ''; form.elements.description.value = data.description || ''; form.elements.price.value = data.price || ''; form.elements.pixelId.value = '2240942626481684';
  $('mediaEditor').replaceChildren();
  for (const item of Array.isArray(data.media) ? data.media : []) addMediaEntry(item);
}

$('addMedia').addEventListener('click', () => addMediaEntry());
$('search').addEventListener('input', renderOrders);
$('sortOrders').addEventListener('change', renderOrders);
$('filterWilaya').addEventListener('change', () => { currentPage = 1; renderOrders(); });
$('pageSize').addEventListener('change', () => { currentPage = 1; renderOrders(); });
$('dateFrom').addEventListener('change', renderOrders);
$('dateTo').addEventListener('change', renderOrders);
$('clearSearch').addEventListener('click', () => { $('search').value = ''; currentPage = 1; renderOrders(); $('search').focus(); });
$('resetFilters').addEventListener('click', () => { $('search').value = ''; $('dateFrom').value = ''; $('dateTo').value = ''; $('sortOrders').value = 'newest'; $('filterWilaya').value = ''; $('pageSize').value = '25'; activeStatus = 'all'; currentPage = 1; renderOrders(); });
$('exportOrders').addEventListener('click', exportOrders);
$('previousPage').addEventListener('click', () => { currentPage -= 1; renderOrders(); });
$('nextPage').addEventListener('click', () => { currentPage += 1; renderOrders(); });
$('messageTemplates').addEventListener('click', () => { $('messageTemplateSelect').dispatchEvent(new Event('change')); $('messageDialog').showModal(); });
$('messageTemplateSelect').addEventListener('change', () => { $('messageTemplateText').value = messageTemplates[$('messageTemplateSelect').value] || ''; $('messageCopyStatus').textContent = ''; });
$('copyMessageTemplate').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('messageTemplateText').value); $('messageCopyStatus').textContent = 'نُسخت الرسالة.'; }
  catch { $('messageTemplateText').select(); $('messageCopyStatus').textContent = 'حدّد النص وانسخه يدويًا.'; }
});
$('copyStoreLink').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('https://tawabil.africacold.fr/'); $('copyStoreLink').textContent = 'تم النسخ ✓'; }
  catch { $('copyStoreLink').textContent = 'انسخ من الرابط الظاهر'; }
  window.setTimeout(() => { $('copyStoreLink').textContent = 'نسخ الرابط'; }, 2200);
});
$('settingsForm').addEventListener('click', event => {
  const tab = event.target.closest('[data-settings-tab]');
  if (!tab) return;
  const name = tab.dataset.settingsTab;
  document.querySelectorAll('[data-settings-tab]').forEach(button => { const active = button === tab; button.classList.toggle('is-active', active); button.setAttribute('aria-selected', String(active)); });
  document.querySelectorAll('[data-settings-panel]').forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== name; });
});
$('dashboard').addEventListener('click', event => {
  const nav = event.target.closest('[data-admin-view]');
  if (nav) setAdminView(nav.dataset.adminView);
  const jump = event.target.closest('[data-go-view]');
  if (jump) { setAdminView(jump.dataset.goView); if (jump.dataset.goView === 'orders') $('search').focus({ preventScroll: true }); }
});
$('statusFilters').addEventListener('click', event => { const button = event.target.closest('[data-status]'); if (!button) return; activeStatus = button.dataset.status; currentPage = 1; renderOrders(); });
$('refresh').addEventListener('click', () => loadOrders().catch(error => { $('adminStatus').textContent = error.message; }));
$('cancelEditOrder').addEventListener('click', () => $('editOrderDialog').close());
$('editOrderForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button[type="submit"]');
  const body = { orderId: Number(form.elements.orderId.value), fullName: form.elements.fullName.value.trim(), phone: form.elements.phone.value.trim(), wilaya: form.elements.wilaya.value.trim(), address: form.elements.address.value.trim(), quantity: Number(form.elements.quantity.value), notes: form.elements.notes.value.trim(), status: form.elements.status.value };
  button.disabled = true;
  try {
    await api('order-update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const order = orders.find(item => item.id === body.orderId);
    if (order) Object.assign(order, { fullName: body.fullName, phone: body.phone, wilaya: body.wilaya, address: body.address, quantity: body.quantity, notes: body.notes, status: body.status });
    $('editOrderDialog').close(); renderOrders(); $('adminStatus').textContent = `تم حفظ تعديلات الطلب #${body.orderId}.`;
  } catch (error) { $('adminStatus').textContent = error.message; }
  finally { button.disabled = false; }
});
$('login').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button[type="submit"]'); button.disabled = true; $('loginStatus').textContent = '';
  try {
    const result = await api('login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: form.elements.password.value }) });
    token = result.token; sessionStorage.setItem('courseAdminToken', token); form.reset(); await loadOrders(); await loadSettings();
  } catch (error) { $('loginStatus').textContent = error.message; }
  finally { button.disabled = false; }
});
$('logout').addEventListener('click', async () => {
  try { await api('logout', { method: 'POST' }); } catch {}
  token = ''; sessionStorage.removeItem('courseAdminToken'); orders = []; $('rows').replaceChildren(); $('ordersMobile').replaceChildren(); $('dashboard').hidden = true; $('login').hidden = false; $('admin-login-nav').hidden = false;
});
$('settingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button[type="submit"]'); button.disabled = true; $('settingsStatus').textContent = '';
  try {
    const body = { title: form.elements.title.value.trim(), description: form.elements.description.value.trim(), price: form.elements.price.value.trim(), pixelId: form.elements.pixelId.value.trim(), media: readMediaEntries() };
    if (!body.title || !body.description) {
      $('settingsStatus').textContent = 'أدخل اسم الباك ووصفه قبل الحفظ.';
      const missingTab = body.title ? 'content' : 'general';
      document.querySelector(`[data-settings-tab="${missingTab}"]`).click();
      form.elements[body.title ? 'description' : 'title'].focus();
      return;
    }
    if (body.pixelId && !/^\d{6,20}$/.test(body.pixelId)) {
      $('settingsStatus').textContent = 'أدخل معرّف Pixel الرقمي من 6 إلى 20 رقمًا.';
      document.querySelector('[data-settings-tab="tracking"]').click();
      form.elements.pixelId.focus();
      return;
    }
    await api('settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    $('settingsStatus').textContent = 'تم حفظ الإعدادات. بيكسل Meta مدمج تلقائيًا في الموقع.';
  } catch (error) { $('settingsStatus').textContent = error.message; }
  finally { button.disabled = false; }
});

if (token) loadOrders().then(loadSettings).catch(() => {});
