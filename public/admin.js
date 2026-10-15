const $ = id => document.getElementById(id);
const API = 'https://cawroeqwtuxfmaqxuypd.supabase.co/functions/v1/course-api';
let orders = [];
let activeStatus = 'new';
let token = sessionStorage.getItem('courseAdminToken') || '';
const orderStatuses = [['new', 'جديدة'], ['confirmed', 'مؤكدة'], ['rejected', 'مرفوضة']];

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = new URL(API);
  url.searchParams.set('route', path);
  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) { token = ''; sessionStorage.removeItem('courseAdminToken'); $('dashboard').hidden = true; $('login').hidden = false; orders = []; $('rows').replaceChildren(); $('ordersMobile').replaceChildren(); }
    throw Error(data.error || 'تعذر تنفيذ الطلب.');
  }
  return data;
}

function addCell(row, label, value, className = '') {
  const cell = document.createElement('td'); cell.dataset.label = label; cell.textContent = value || '—'; if (className) cell.className = className; row.append(cell);
}
function dateLabel(value) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('ar-DZ'); }

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

function renderOrders() {
  const query = $('search').value.trim().toLocaleLowerCase('ar');
  const countByStatus = Object.fromEntries(orderStatuses.map(([status]) => [status, orders.filter(order => (order.status || 'new') === status).length]));
  $('countNew').textContent = countByStatus.new; $('countConfirmed').textContent = countByStatus.confirmed; $('countRejected').textContent = countByStatus.rejected; $('countAll').textContent = orders.length;
  const visible = orders.filter(order => (activeStatus === 'all' || (order.status || 'new') === activeStatus) && Object.values(order).some(value => String(value ?? '').toLocaleLowerCase('ar').includes(query)));
  $('count').textContent = `${orders.length} طلب`;
  document.querySelectorAll('.status-filter').forEach(button => { const active = button.dataset.status === activeStatus; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
  const rows = document.createDocumentFragment(), cards = document.createDocumentFragment();
  if (!visible.length) {
    const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 10; cell.className = 'empty-orders'; cell.textContent = orders.length ? 'لا توجد طلبات في هذا القسم تطابق البحث.' : 'لم يصل أي طلب بعد. ستظهر الطلبات الجديدة هنا.'; row.append(cell); rows.append(row);
    const empty = document.createElement('div'); empty.className = 'order-card empty-orders'; empty.textContent = cell.textContent; cards.append(empty);
  } else for (const order of visible) {
    const row = document.createElement('tr');
    addCell(row, 'رقم', `#${order.id}`); addCell(row, 'الاسم الكامل', order.fullName); addCell(row, 'الهاتف', order.phone, 'ltr'); addCell(row, 'الولاية', order.wilaya); addCell(row, 'عنوان التوصيل', order.address); addCell(row, 'الكمية', String(order.quantity)); addCell(row, 'ملاحظة', order.notes); const statusCell = document.createElement('td'); statusCell.dataset.label = 'الحالة'; statusCell.append(makeStatusControl(order)); row.append(statusCell); addCell(row, 'وقت الطلب', dateLabel(order.createdAt)); const actionCell = document.createElement('td'); actionCell.dataset.label = 'إجراء'; actionCell.append(makeDeleteButton(order)); row.append(actionCell); rows.append(row);
    const card = document.createElement('article'); card.className = 'order-card';
    const head = document.createElement('div'); head.className = 'order-card-head';
    const name = document.createElement('strong'); name.textContent = order.fullName || 'طلب جديد';
    const id = document.createElement('span'); id.textContent = `#${order.id} · ${dateLabel(order.createdAt)}`; head.append(name, id);
    const details = document.createElement('dl');
    for (const [label, value, className] of [['الهاتف',order.phone,'ltr'],['الولاية',order.wilaya,''],['عنوان التوصيل',order.address,'order-address'],['الكمية',String(order.quantity),''],['ملاحظة',order.notes,'order-notes']]) {
      const item = document.createElement('div'); if (className) item.className = className;
      const term = document.createElement('dt'); term.textContent = label; const description = document.createElement('dd'); description.textContent = value || '—'; if (className === 'ltr') description.dir = 'ltr'; item.append(term, description); details.append(item);
    }
    card.append(head, details, makeStatusControl(order), makeDeleteButton(order)); cards.append(card);
  }
  $('rows').replaceChildren(rows); $('ordersMobile').replaceChildren(cards);
  $('adminStatus').textContent = `آخر تحديث: ${new Date().toLocaleTimeString('ar-DZ')}`;
}

async function loadOrders() { orders = await api('orders'); renderOrders(); $('login').hidden = true; $('dashboard').hidden = false; }

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
  const form = $('settingsForm'); form.elements.title.value = data.title || ''; form.elements.description.value = data.description || ''; form.elements.price.value = data.price || ''; form.elements.pixelId.value = data.pixelId || '';
  $('mediaEditor').replaceChildren();
  for (const item of Array.isArray(data.media) ? data.media : []) addMediaEntry(item);
}

$('addMedia').addEventListener('click', () => addMediaEntry());
$('search').addEventListener('input', renderOrders);
$('statusFilters').addEventListener('click', event => { const button = event.target.closest('[data-status]'); if (!button) return; activeStatus = button.dataset.status; renderOrders(); });
$('refresh').addEventListener('click', () => loadOrders().catch(error => { $('adminStatus').textContent = error.message; }));
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
  token = ''; sessionStorage.removeItem('courseAdminToken'); orders = []; $('rows').replaceChildren(); $('ordersMobile').replaceChildren(); $('dashboard').hidden = true; $('login').hidden = false;
});
$('settingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button[type="submit"]'); button.disabled = true; $('settingsStatus').textContent = '';
  try {
    const body = { title: form.elements.title.value.trim(), description: form.elements.description.value.trim(), price: form.elements.price.value.trim(), pixelId: form.elements.pixelId.value.trim(), media: readMediaEntries() };
    await api('settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    $('settingsStatus').textContent = 'تم حفظ الإعدادات. سيُستخدم معرّف Meta Pixel في صفحة الباك بعد التحديث.';
  } catch (error) { $('settingsStatus').textContent = error.message; }
  finally { button.disabled = false; }
});

if (token) loadOrders().then(loadSettings).catch(() => {});
