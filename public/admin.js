/**
 * بسكريا للتوابل · كود لوحة الإدارة الفاخرة
 * يتصل مباشرة بـ Supabase Edge Function (course-api)
 * ويدعم التصميم العصري المطابق لـ Figma
 */

const $ = id => document.getElementById(id);
const API = 'https://cawroeqwtuxfmaqxuypd.supabase.co/functions/v1/course-api';

let orders = [];
let activeStatus = 'all';
let activeView = 'overview';
let currentPage = 1;
let currentTemplateOrderId = null;
let token = sessionStorage.getItem('courseAdminToken') || '';

const orderStatuses = [
  ['new', 'جديدة'],
  ['confirmed', 'مؤكدة'],
  ['rejected', 'مرفوضة']
];

const messageTemplates = {
  confirm: 'مرحبًا {name} 🌿\nشكرًا لاختيارك بسكريا للتوابل!\nنود تأكيد طلبك #{id}:\nباك نكهات بسكرة × {quantity} — المجموع {price} دج.\nالتوصيل إلى: {address}، ولاية {wilaya}.\nرسوم التوصيل تُؤكّد معك هاتفيًا.\nهل تؤكدين الطلب والعنوان؟ يسعدنا ردّك بكلمة «نؤكد».\nنكهات أصيلة، من قلب بسكرة 💛',
  delivery: 'السلام عليكم {name}، نرجو تأكيد عنوان التوصيل لطلبيتك رقم #{id}: {address}، ولاية {wilaya}.\nشكرًا لك من بسكريا للتوابل.',
  followup: 'السلام عليكم {name}، نتواصل معك بخصوص طلبيتك رقم #{id} من بسكريا للتوابل.\nهل ما زلت ترغب في تأكيدها ومتابعة التوصيل؟'
};

/* API Helper */
async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = new URL(API);
  url.searchParams.set('route', path);
  const response = await fetch(url, { ...options, headers });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      token = '';
      sessionStorage.removeItem('courseAdminToken');
      $('dashboard').hidden = true;
      $('login').hidden = false;
      $('admin-login-nav').hidden = false;
      orders = [];
      $('rows').replaceChildren();
      $('ordersMobile').replaceChildren();
    }
    throw Error(data.error || 'تعذر تنفيذ الطلب.');
  }
  return data;
}

/* Helpers */
function formatPhone(phone) {
  if (!phone) return '—';
  const clean = String(phone).replace(/[^\d+]/g, '');
  if (clean.length === 10 && clean.startsWith('0')) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 6)} ${clean.slice(6, 8)} ${clean.slice(8)}`;
  }
  return clean;
}

function getInternationalPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('0')) return `213${digits.slice(1)}`;
  if (!digits.startsWith('213') && digits.length <= 10) return `213${digits}`;
  return digits;
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('ar-DZ', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function timeAgo(dateString) {
  const date = new Date(dateString);
  if (Number.isNaN(date.valueOf())) return '—';
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'الآن';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}

function getInitials(name) {
  if (!name) return 'ط';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]} ${parts[1][0]}`;
  }
  return parts[0].slice(0, 2);
}

function viewTitle(view) {
  return ({
    overview: 'نظرة عامة',
    orders: 'الطلبات',
    analytics: 'تحليلات الماركتينج',
    offers: 'إدارة العروض والباقات',
    wilayas: 'توزيع الولايات والتوصيل',
    inventory: 'المخزون والمستودع',
    settings: 'محتوى الباك',
    audit: 'سجل النشاط والأمان'
  })[view] || 'نظرة عامة';
}

function setAdminView(view) {
  activeView = view;
  document.querySelectorAll('[data-view-panel]').forEach(panel => {
    panel.hidden = panel.dataset.viewPanel !== view;
  });

  // Desktop sidebar links
  document.querySelectorAll('.admin-nav-link').forEach(button => {
    const active = button.dataset.adminView === view;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  // Mobile navigation tabs
  document.querySelectorAll('.mobile-tab').forEach(tab => {
    const active = tab.dataset.adminView === view;
    tab.classList.toggle('is-active', active);
  });

  if ($('pageCrumb')) $('pageCrumb').textContent = viewTitle(view);

  if (view === 'analytics') renderAnalyticsCharts();
  if (view === 'offers') renderOffers();
  if (view === 'wilayas') renderWilayasPerformance();
  if (view === 'audit') renderAuditLog();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* Overview Screen Rendering */
function renderOverview(countByStatus) {
  const total = orders.length;
  const newCount = countByStatus.new || 0;
  const confirmedCount = countByStatus.confirmed || 0;
  const rejectedCount = countByStatus.rejected || 0;

  const confirmedPct = total ? Math.round((confirmedCount / total) * 100) : 0;
  const rejectedPct = total ? Math.round((rejectedCount / total) * 100) : 0;
  const newPct = total ? Math.round((newCount / total) * 100) : 0;

  // Stat numbers
  $('statTotal').textContent = total.toLocaleString('ar-DZ');
  $('statNew').textContent = newCount.toLocaleString('ar-DZ');
  $('statConfirmed').textContent = confirmedCount.toLocaleString('ar-DZ');
  $('statRejected').textContent = rejectedCount.toLocaleString('ar-DZ');

  if ($('bannerNewCount')) $('bannerNewCount').textContent = newCount.toLocaleString('ar-DZ');
  if ($('statConfirmedPct')) $('statConfirmedPct').textContent = `${confirmedPct}%`;
  if ($('statRejectedPct')) $('statRejectedPct').textContent = `${rejectedPct}%`;

  // Overview distribution meters
  $('overviewNew').textContent = newCount.toLocaleString('ar-DZ');
  $('overviewConfirmed').textContent = confirmedCount.toLocaleString('ar-DZ');
  $('overviewRejected').textContent = rejectedCount.toLocaleString('ar-DZ');

  if ($('overviewNewPct')) $('overviewNewPct').textContent = `${newPct}%`;
  if ($('overviewConfirmedPct')) $('overviewConfirmedPct').textContent = `${confirmedPct}%`;
  if ($('overviewRejectedPct')) $('overviewRejectedPct').textContent = `${rejectedPct}%`;

  if ($('meterSubtitle')) $('meterSubtitle').textContent = `${total.toLocaleString('ar-DZ')} طلبًا · منذ إطلاق الباك`;

  // Dynamic success ratio (e.g., 7 من كل 10)
  const ratio = total ? Math.round((confirmedCount / total) * 10) : 7;
  if ($('meterInsightText')) $('meterInsightText').textContent = `${ratio} من كل 10 طلبات تم تأكيدها بنجاح.`;

  $('meterNew').style.width = `${newPct}%`;
  $('meterConfirmed').style.width = `${confirmedPct}%`;
  $('meterRejected').style.width = `${rejectedPct}%`;

  // Navigation badge counts
  if ($('sideCount')) $('sideCount').textContent = newCount.toLocaleString('ar-DZ');
  if ($('mobileSideCount')) $('mobileSideCount').textContent = newCount.toLocaleString('ar-DZ');

  // Recent Orders Feed (up to 4 items)
  const recent = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 4);
  const list = $('recentOrders');
  if (!recent.length) {
    const empty = document.createElement('p');
    empty.className = 'recent-empty';
    empty.textContent = 'ستظهر هنا أحدث الطلبات عند وصولها.';
    list.replaceChildren(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const order of recent) {
    const item = document.createElement('div');
    item.className = 'recent-order-item';

    const avatar = document.createElement('div');
    avatar.className = 'recent-initial-avatar';
    avatar.textContent = getInitials(order.fullName);

    const info = document.createElement('div');
    info.className = 'recent-order-info';
    const name = document.createElement('strong');
    name.textContent = order.fullName || `الطلب #${order.id}`;
    const meta = document.createElement('small');
    meta.textContent = `#${order.id} · ${order.wilaya || 'غير محدد'} · ${dateLabel(order.createdAt)}`;
    info.append(name, meta);

    const statusCol = document.createElement('div');
    statusCol.className = 'recent-order-meta';
    const statusPill = document.createElement('span');
    const stKey = order.status || 'new';
    statusPill.className = `order-status-pill status-${stKey}`;
    statusPill.textContent = `• ${orderStatuses.find(item => item[0] === stKey)?.[1] || 'جديدة'}`;

    const timeAgoText = document.createElement('span');
    timeAgoText.className = 'recent-time-ago';
    timeAgoText.textContent = timeAgo(order.createdAt);
    statusCol.append(statusPill, timeAgoText);

    item.append(avatar, info, statusCol);
    fragment.append(item);
  }
  list.replaceChildren(fragment);
}

/* Inline Table Status Selector */
function makeStatusSelector(order) {
  const select = document.createElement('select');
  select.className = `inline-status-select status-${order.status || 'new'}`;
  select.setAttribute('aria-label', `حالة الطلب رقم ${order.id}`);

  for (const [val, label] of orderStatuses) {
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = `• ${label}`;
    select.append(opt);
  }
  select.value = order.status || 'new';

  select.addEventListener('change', async () => {
    const previous = order.status || 'new';
    const next = select.value;
    select.disabled = true;
    try {
      await api('order-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, status: next })
      });
      order.status = next;
      select.className = `inline-status-select status-${next}`;
      renderOrders();
      $('adminStatus').textContent = `تم تحديث حالة الطلب #${order.id} إلى «${orderStatuses.find(item => item[0] === next)[1]}».`;
    } catch (error) {
      select.value = previous;
      select.className = `inline-status-select status-${previous}`;
      $('adminStatus').textContent = error.message;
    } finally {
      select.disabled = false;
    }
  });

  return select;
}

/* Edit Dialog Opener */
function openEditDialog(order) {
  const form = $('editOrderForm');
  form.elements.orderId.value = order.id;
  form.elements.fullName.value = order.fullName || '';
  form.elements.phone.value = order.phone || '';
  form.elements.address.value = order.address || '';
  form.elements.quantity.value = order.quantity || 1;
  form.elements.notes.value = order.notes || '';
  form.elements.status.value = order.status || 'new';

  if ($('modalWilayaSelect')) {
    $('modalWilayaSelect').value = order.wilaya || '';
  }

  $('editOrderNumber').textContent = `الطلب #${order.id} · راجع بيانات العميل قبل التأكيد.`;
  if ($('modalSummaryTitle')) $('modalSummaryTitle').textContent = `باك نكهات بسكرة × ${order.quantity || 1}`;
  if ($('modalSummaryStatus')) {
    const st = order.status || 'new';
    $('modalSummaryStatus').className = `order-status-pill status-${st}`;
    $('modalSummaryStatus').textContent = `• ${orderStatuses.find(item => item[0] === st)?.[1] || 'جديدة'}`;
  }

  $('editOrderDialog').showModal();
}

/* Message Templates Modal Opener */
function openMessageTemplates(order = null) {
  const activeOrder = order || orders[0] || {
    id: '1024',
    fullName: 'العميل',
    phone: '0550 00 00 00',
    wilaya: 'الجزائر',
    address: 'حي النصر',
    quantity: 1
  };

  currentTemplateOrderId = activeOrder.id;

  if ($('tplCustomerName')) $('tplCustomerName').textContent = activeOrder.fullName || `طلب #${activeOrder.id}`;
  if ($('tplCustomerPhone')) $('tplCustomerPhone').textContent = formatPhone(activeOrder.phone);
  if ($('tplCustomerDetails')) $('tplCustomerDetails').textContent = `${activeOrder.wilaya || 'الجزائر'} · ${activeOrder.quantity || 1} باك · الدفع عند الاستلام`;

  updateTemplateText(activeOrder);
  $('messageDialog').showModal();
}

function updateTemplateText(order) {
  const tplKey = $('messageTemplateSelect').value || 'confirm';
  let text = messageTemplates[tplKey] || messageTemplates.confirm;

  const packPriceStr = $('settingsPriceInput')?.value?.replace(/[^\d]/g, '') || '15000';
  const packPrice = Number(packPriceStr) || 15000;
  const qty = Number(order.quantity) || 1;
  const totalPrice = (packPrice * qty).toLocaleString('ar-DZ');

  text = text
    .replace('{name}', order.fullName || 'العميل')
    .replace('{id}', order.id || '')
    .replace('{quantity}', qty)
    .replace('{price}', totalPrice)
    .replace('{address}', order.address || 'العنوان المسجل')
    .replace('{wilaya}', order.wilaya || '');

  $('messageTemplateText').value = text;

  // Update WhatsApp link
  const intPhone = getInternationalPhone(order.phone);
  const waUrl = intPhone ? `https://wa.me/${intPhone}?text=${encodeURIComponent(text)}` : '#';
  $('openWhatsappAction').href = waUrl;
}

/* Orders List Filtering & Pagination */
function getVisibleOrders() {
  const query = $('search').value.trim().toLocaleLowerCase('ar');
  const from = $('dateFrom').value;
  const to = $('dateTo').value;
  const selectedWilaya = $('filterWilaya').value;

  const visible = orders.filter(order => {
    const parsedDate = new Date(order.createdAt);
    const orderDate = Number.isNaN(parsedDate.valueOf()) ? '' : parsedDate.toISOString().slice(0, 10);
    return (activeStatus === 'all' || (order.status || 'new') === activeStatus)
      && (!from || orderDate >= from)
      && (!to || orderDate <= to)
      && (!selectedWilaya || order.wilaya === selectedWilaya)
      && Object.values(order).some(value => String(value ?? '').toLocaleLowerCase('ar').includes(query));
  });

  return visible.sort((a, b) => {
    if ($('sortOrders').value === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
    if ($('sortOrders').value === 'quantity') return (Number(b.quantity) || 0) - (Number(a.quantity) || 0);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function populateWilayas() {
  const wilayaList = window.ELB_DZ ? window.ELB_DZ.map(w => w[1]) : [];
  const existingInOrders = [...new Set(orders.map(o => String(o.wilaya || '').trim()).filter(Boolean))];
  const combined = [...new Set([...wilayaList, ...existingInOrders])].sort((a, b) => a.localeCompare(b, 'ar'));

  // Populate Filter select
  const filterSelect = $('filterWilaya');
  const currentFilterVal = filterSelect.value;
  filterSelect.replaceChildren(new Option('كل الولايات', ''));
  for (const w of combined) {
    filterSelect.append(new Option(w, w));
  }
  filterSelect.value = combined.includes(currentFilterVal) ? currentFilterVal : '';

  // Populate Modal select
  const modalSelect = $('modalWilayaSelect');
  if (modalSelect) {
    const currentModalVal = modalSelect.value;
    modalSelect.replaceChildren(new Option('اختر الولاية...', ''));
    for (const w of combined) {
      modalSelect.append(new Option(w, w));
    }
    modalSelect.value = combined.includes(currentModalVal) ? currentModalVal : '';
  }
}

function renderOrders() {
  const countByStatus = Object.fromEntries(
    orderStatuses.map(([status]) => [status, orders.filter(order => (order.status || 'new') === status).length])
  );

  $('countNew').textContent = countByStatus.new || 0;
  $('countConfirmed').textContent = countByStatus.confirmed || 0;
  $('countRejected').textContent = countByStatus.rejected || 0;
  $('countAll').textContent = orders.length;

  if ($('ordersCountBadge')) $('ordersCountBadge').textContent = orders.length.toLocaleString('ar-DZ');

  renderOverview(countByStatus);

  const sorted = getVisibleOrders();
  const pageSizeValue = $('pageSize').value;
  const pageSize = pageSizeValue === 'all' ? Math.max(sorted.length, 1) : Number(pageSizeValue) || 25;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  currentPage = Math.min(Math.max(currentPage, 1), pageCount);
  const pageOrders = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const query = $('search').value.trim();
  $('count').textContent = `عرض ${pageOrders.length.toLocaleString('ar-DZ')} من أصل ${sorted.length.toLocaleString('ar-DZ')} طلبًا`;
  $('clearSearch').hidden = !query;

  // Active status tabs
  document.querySelectorAll('.status-tab').forEach(tab => {
    const active = tab.dataset.status === activeStatus;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-pressed', String(active));
  });

  const desktopRows = document.createDocumentFragment();
  const mobileCards = document.createDocumentFragment();

  if (!pageOrders.length) {
    const emptyRow = document.createElement('tr');
    const emptyCell = document.createElement('td');
    emptyCell.colSpan = 10;
    emptyCell.style.textAlign = 'center';
    emptyCell.style.padding = '40px 20px';
    emptyCell.style.color = 'var(--c-text-muted)';
    emptyCell.textContent = orders.length ? 'لا توجد طلبات تطابق معايير البحث الحالية.' : 'لم يصل أي طلب بعد. ستظهر طلبات المتجر هنا فور تسجيلها.';
    emptyRow.append(emptyCell);
    desktopRows.append(emptyRow);

    const emptyCard = document.createElement('div');
    emptyCard.className = 'figma-mobile-order-card';
    emptyCard.style.textAlign = 'center';
    emptyCard.style.color = 'var(--c-text-muted)';
    emptyCard.textContent = emptyCell.textContent;
    mobileCards.append(emptyCard);
  } else {
    for (const order of pageOrders) {
      // 1. Desktop Row
      const row = document.createElement('tr');

      // #ID
      const idTd = document.createElement('td');
      idTd.className = 'order-id-cell';
      idTd.textContent = `#${order.id}`;
      row.append(idTd);

      // Name
      const nameTd = document.createElement('td');
      nameTd.className = 'order-name-cell';
      nameTd.textContent = order.fullName || '—';
      row.append(nameTd);

      // Phone + Quick Actions
      const phoneTd = document.createElement('td');
      const phoneWrap = document.createElement('div');
      phoneWrap.className = 'phone-action-cell';

      const intPhone = getInternationalPhone(order.phone);
      if (intPhone) {
        const waLink = document.createElement('a');
        waLink.className = 'phone-icon-btn btn-whatsapp';
        const defaultText = `السلام عليكم ${order.fullName || ''}، نؤكد استلام طلبيتك رقم #${order.id} من بسكريا للتوابل.`;
        waLink.href = `https://wa.me/${intPhone}?text=${encodeURIComponent(defaultText)}`;
        waLink.target = '_blank';
        waLink.rel = 'noopener noreferrer';
        waLink.title = 'واتساب مباشر';
        waLink.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z"/></svg>`;
        phoneWrap.append(waLink);

        const callLink = document.createElement('a');
        callLink.className = 'phone-icon-btn btn-call';
        callLink.href = `tel:${order.phone}`;
        callLink.title = 'اتصال هاتفي';
        callLink.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;
        phoneWrap.append(callLink);
      }

      const phoneSpan = document.createElement('span');
      phoneSpan.className = 'phone-number-text';
      phoneSpan.textContent = formatPhone(order.phone);
      phoneWrap.append(phoneSpan);
      phoneTd.append(phoneWrap);
      row.append(phoneTd);

      // Wilaya
      const wilayaTd = document.createElement('td');
      wilayaTd.textContent = order.wilaya || '—';
      row.append(wilayaTd);

      // Address
      const addressTd = document.createElement('td');
      addressTd.textContent = order.address || '—';
      row.append(addressTd);

      // Quantity
      const qtyTd = document.createElement('td');
      qtyTd.style.fontWeight = '800';
      qtyTd.textContent = String(order.quantity || 1);
      row.append(qtyTd);

      // Notes
      const notesTd = document.createElement('td');
      notesTd.textContent = order.notes || '—';
      row.append(notesTd);

      // Status
      const statusTd = document.createElement('td');
      statusTd.append(makeStatusSelector(order));
      row.append(statusTd);

      // Time
      const timeTd = document.createElement('td');
      timeTd.innerHTML = `<div>${dateLabel(order.createdAt)}</div><small style="color:var(--c-text-muted)">${timeAgo(order.createdAt)}</small>`;
      row.append(timeTd);

      // Actions (Print, Templates, Edit & Delete)
      const actionsTd = document.createElement('td');
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'table-actions-cell';

      const printBtn = document.createElement('button');
      printBtn.type = 'button';
      printBtn.className = 'row-action-btn';
      printBtn.title = 'طباعة وصل التسليم والشحن (Bon de livraison)';
      printBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`;
      printBtn.addEventListener('click', () => openInvoiceModal(order));

      const msgBtn = document.createElement('button');
      msgBtn.type = 'button';
      msgBtn.className = 'row-action-btn';
      msgBtn.title = 'قوالب الرسائل الذكية (واتساب / SMS)';
      msgBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
      msgBtn.addEventListener('click', () => openMessageTemplates(order));

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'row-action-btn';
      editBtn.title = 'تعديل بيانات الطلب';
      editBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      editBtn.addEventListener('click', () => openEditDialog(order));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'row-action-btn btn-delete';
      delBtn.title = 'حذف الطلب';
      delBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`;
      delBtn.addEventListener('click', async () => {
        if (!window.confirm(`هل أنت متأكد من حذف الطلب #${order.id} نهائيًا؟`)) return;
        delBtn.disabled = true;
        try {
          await api('order-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: order.id })
          });
          orders = orders.filter(item => item.id !== order.id);
          renderOrders();
          addAudit('حذف طلب', `تم حذف الطلب #${order.id}`, 'طلب');
          $('adminStatus').textContent = `تم حذف الطلب #${order.id} بنجاح.`;
        } catch (err) {
          delBtn.disabled = false;
          $('adminStatus').textContent = err.message;
        }
      });

      actionsWrap.append(printBtn, msgBtn, editBtn, delBtn);
      actionsTd.append(actionsWrap);
      row.append(actionsTd);

      desktopRows.append(row);

      // 2. Mobile Card (Matching Figma Mobile Design)
      const card = document.createElement('article');
      card.className = 'figma-mobile-order-card';

      const cardTop = document.createElement('div');
      cardTop.className = 'mobile-card-top';
      const cardId = document.createElement('span');
      cardId.className = 'mobile-order-id';
      cardId.textContent = `#${order.id}`;
      cardTop.append(cardId, makeStatusSelector(order));

      const cardCustomer = document.createElement('div');
      const custName = document.createElement('h3');
      custName.className = 'mobile-customer-name';
      custName.textContent = order.fullName || 'طلب جديد';
      const custPhone = document.createElement('div');
      custPhone.className = 'mobile-customer-phone';
      custPhone.textContent = formatPhone(order.phone);
      cardCustomer.append(custName, custPhone);

      // Quick Action Buttons
      const quickActions = document.createElement('div');
      quickActions.className = 'mobile-quick-actions';

      const mCall = document.createElement('a');
      mCall.className = 'mobile-action-btn';
      mCall.href = `tel:${order.phone}`;
      mCall.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>اتصال</span>`;

      const mWa = document.createElement('a');
      mWa.className = 'mobile-action-btn btn-wa';
      const defaultWaText = `السلام عليكم ${order.fullName || ''}، نؤكد استلام طلبيتك رقم #${order.id} من بسكريا للتوابل.`;
      mWa.href = intPhone ? `https://wa.me/${intPhone}?text=${encodeURIComponent(defaultWaText)}` : '#';
      mWa.target = '_blank';
      mWa.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z"/></svg><span>واتساب</span>`;
      quickActions.append(mCall, mWa);

      // Details Box
      const detailsBox = document.createElement('div');
      detailsBox.className = 'mobile-order-details-box';
      detailsBox.innerHTML = `
        <div class="mobile-detail-row"><span>الولاية:</span><strong>${order.wilaya || '—'}</strong></div>
        <div class="mobile-detail-row"><span>عنوان التوصيل:</span><strong>${order.address || '—'}</strong></div>
        <div class="mobile-detail-row"><span>الكمية:</span><strong>${order.quantity || 1} باك</strong></div>
        <div class="mobile-detail-row"><span>ملاحظات:</span><strong>${order.notes || 'دون ملاحظات'}</strong></div>
        <div class="mobile-detail-row"><span>وقت الطلب:</span><small>${dateLabel(order.createdAt)} (${timeAgo(order.createdAt)})</small></div>
      `;

      // Foot Edit / Delete / Print
      const footActions = document.createElement('div');
      footActions.className = 'mobile-card-foot-actions';

      const mPrint = document.createElement('button');
      mPrint.type = 'button';
      mPrint.className = 'button button-white';
      mPrint.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg><span>وصل التسليم</span>`;
      mPrint.addEventListener('click', () => openInvoiceModal(order));

      const mEdit = document.createElement('button');
      mEdit.type = 'button';
      mEdit.className = 'button button-white';
      mEdit.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg><span>تعديل</span>`;
      mEdit.addEventListener('click', () => openEditDialog(order));

      const mDel = document.createElement('button');
      mDel.type = 'button';
      mDel.className = 'button button-white';
      mDel.style.color = 'var(--status-rejected-text)';
      mDel.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg><span>حذف</span>`;
      mDel.addEventListener('click', async () => {
        if (!window.confirm(`هل أنت متأكد من حذف الطلب #${order.id} نهائيًا؟`)) return;
        mDel.disabled = true;
        try {
          await api('order-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: order.id })
          });
          orders = orders.filter(item => item.id !== order.id);
          renderOrders();
          addAudit('حذف طلب', `تم حذف الطلب #${order.id}`, 'طلب');
        } catch (err) {
          mDel.disabled = false;
          alert(err.message);
        }
      });

      footActions.append(mPrint, mEdit, mDel);
      card.append(cardTop, cardCustomer, quickActions, detailsBox, footActions);
      mobileCards.append(card);
    }
  }

  $('rows').replaceChildren(desktopRows);
  $('ordersMobile').replaceChildren(mobileCards);

  // Pagination updates
  $('pageIndicator').textContent = `${currentPage.toLocaleString('ar-DZ')} / ${pageCount.toLocaleString('ar-DZ')}`;
  $('previousPage').disabled = currentPage <= 1;
  $('nextPage').disabled = currentPage >= pageCount;
  $('ordersPagination').hidden = sorted.length <= pageSize;

  const updatedTime = new Date().toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' });
  if ($('lastUpdated')) $('lastUpdated').textContent = `آخر تحديث ${updatedTime}`;
}

/* Export Orders to CSV */
function exportOrders() {
  const columns = [
    ['رقم الطلب', order => `#${order.id}`],
    ['الاسم الكامل', order => order.fullName],
    ['رقم الهاتف', order => order.phone],
    ['الولاية', order => order.wilaya],
    ['عنوان التوصيل', order => order.address],
    ['الكمية', order => order.quantity],
    ['ملاحظات', order => order.notes],
    ['الحالة', order => orderStatuses.find(item => item[0] === (order.status || 'new'))?.[1] || 'جديدة'],
    ['وقت الطلب', order => dateLabel(order.createdAt)],
  ];

  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const selected = getVisibleOrders();
  const content = '\uFEFF' + [
    columns.map(([label]) => csvCell(label)).join(','),
    ...selected.map(order => columns.map(([, fn]) => csvCell(fn(order))).join(','))
  ].join('\r\n');

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `طلبيات-بسكريا-للتوابل-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('adminStatus').textContent = `تم تصدير ملف Excel يتضمن ${selected.length.toLocaleString('ar-DZ')} طلبًا.`;
  addAudit('تصدير Excel', `تم تصدير ملف Excel لـ ${selected.length} طلبًا`, 'طلبات');
}

/* Courier Yalidine Format CSV Export */
function exportYalidine() {
  const selected = getVisibleOrders();
  const columns = [
    ['Tracking', o => `DZ-${o.id}`],
    ['Nom_Client', o => o.fullName || '—'],
    ['Telephone', o => o.phone || '—'],
    ['Wilaya', o => o.wilaya || '—'],
    ['Commune_Adresse', o => o.address || '—'],
    ['Prix', o => 15000 * (Number(o.quantity) || 1)],
    ['Produit', o => `باك نكهات بسكرة (${o.quantity || 1} باقة)`],
    ['Stopdesk', () => '0'],
    ['Remarque', o => o.notes || 'توابل بسكريا - الدفع عند الاستلام']
  ];

  const csvCell = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const content = '\uFEFF' + [
    columns.map(([label]) => csvCell(label)).join(','),
    ...selected.map(order => columns.map(([, fn]) => csvCell(fn(order))).join(','))
  ].join('\r\n');

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `yalidine-orders-biskria-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('adminStatus').textContent = `تم تصدير كشف Yalidine يتضمن ${selected.length.toLocaleString('ar-DZ')} طردًا.`;
  addAudit('تصدير Yalidine', `تم تصدير ملف شحن لـ ${selected.length} طلبًا`, 'شحن');
}

/* Printable Delivery Invoice / Bon de Livraison */
function openInvoiceModal(order) {
  if (!order) return;
  const dateStr = new Date(order.createdAt || Date.now()).toLocaleDateString('ar-DZ', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const packPriceStr = $('settingsPriceInput')?.value?.replace(/[^\d]/g, '') || '15000';
  const unitPrice = Number(packPriceStr) || 15000;
  const qty = Number(order.quantity) || 1;
  const grandTotal = unitPrice * qty;

  if ($('invOrderNum')) $('invOrderNum').textContent = `#${order.id}`;
  if ($('invDate')) $('invDate').textContent = dateStr;
  if ($('invCustomerName')) $('invCustomerName').textContent = order.fullName || '—';
  if ($('invCustomerPhone')) $('invCustomerPhone').textContent = formatPhone(order.phone);
  if ($('invCustomerWilaya')) $('invCustomerWilaya').textContent = order.wilaya || '—';
  if ($('invCustomerAddress')) $('invCustomerAddress').textContent = order.address || '—';
  if ($('invCustomerNotes')) $('invCustomerNotes').textContent = order.notes || 'لا توجد ملاحظات إضافية';

  if ($('invQuantity')) $('invQuantity').textContent = qty;
  if ($('invUnitPrice')) $('invUnitPrice').textContent = `${unitPrice.toLocaleString('ar-DZ')} دج`;
  if ($('invItemTotal')) $('invItemTotal').textContent = `${grandTotal.toLocaleString('ar-DZ')} دج`;
  if ($('invGrandTotal')) $('invGrandTotal').textContent = `${grandTotal.toLocaleString('ar-DZ')} دج`;

  $('invoiceDialog').showModal();
  addAudit('وصل التسليم', `عرض وصل الشحن للطلب #${order.id}`, 'شحن');
}

/* Multi-Offer Management */
const defaultOffers = [
  { id: 'pack5', title: 'عرض 5 أكياس (10 كلغ) + علبة 50غ هدية', price: 15000, kg: '10 كلغ (5 أكياس)', badge: 'الأكثر طلبًا 🔥', freeShipping: true, gift: 'علبة 50غ هدية مجانية' },
  { id: 'bag1', title: 'كيس واحد (2 كلغ)', price: 3000, kg: '2 كلغ (كيس واحد)', badge: 'تجربة', freeShipping: false, gift: 'لا توجد هدية' },
  { id: 'pack10', title: 'عرض باقة المطاعم الكبرى (20 كلغ)', price: 28000, kg: '20 كلغ (10 أكياس)', badge: 'توفير 2000 دج ⚡', freeShipping: true, gift: 'علبتين 50غ هدية + شحن مجاني' }
];

let storeOffers = JSON.parse(localStorage.getItem('tawabil_offers') || 'null') || defaultOffers;

function saveOffers() {
  try {
    localStorage.setItem('tawabil_offers', JSON.stringify(storeOffers));
  } catch {}
  renderOffers();
}

function renderOffers() {
  const container = $('offersCardsContainer');
  if (!container) return;
  container.replaceChildren();

  storeOffers.forEach((offer, idx) => {
    const card = document.createElement('article');
    card.className = 'offer-manage-card';

    card.innerHTML = `
      <div class="offer-card-top">
        <div>
          <h3>${offer.title}</h3>
          ${offer.badge ? `<span class="offer-badge-pill">${offer.badge}</span>` : ''}
        </div>
      </div>
      <div class="offer-price-row">
        <span class="offer-price-number">${Number(offer.price).toLocaleString('ar-DZ')}</span>
        <span class="offer-price-unit">دج</span>
      </div>
      <ul class="offer-features-list">
        <li>الوزن والكمية: <strong>${offer.kg}</strong></li>
        <li>التوصيل: <strong>${offer.freeShipping ? 'توصيل مجاني لـ 58 ولاية' : 'سعر التوصيل يحدد عند الاتصال'}</strong></li>
        ${offer.gift ? `<li>الهدية المرفقة: <strong>${offer.gift}</strong></li>` : ''}
      </ul>
      <div class="offer-actions-footer">
        <button type="button" class="button button-white edit-offer-btn" data-offer-idx="${idx}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          <span>تعديل</span>
        </button>
        <button type="button" class="button button-white delete-offer-btn" style="color:var(--status-rejected-text)" data-offer-idx="${idx}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          <span>حذف</span>
        </button>
      </div>
    `;

    card.querySelector('.edit-offer-btn').addEventListener('click', () => openOfferDialog(idx));
    card.querySelector('.delete-offer-btn').addEventListener('click', () => deleteOffer(idx));

    container.append(card);
  });
}

function openOfferDialog(index = -1) {
  const form = $('offerEditForm');
  form.reset();
  form.elements.offerIndex.value = index;

  if (index >= 0 && storeOffers[index]) {
    const o = storeOffers[index];
    $('offerModalTitle').textContent = 'تعديل عرض ترويجي';
    form.elements.offerTitle.value = o.title || '';
    form.elements.offerPrice.value = o.price || '';
    form.elements.offerKg.value = o.kg || '';
    form.elements.offerBadge.value = o.badge || '';
    form.elements.offerFreeShipping.value = o.freeShipping ? '1' : '0';
    form.elements.offerGift.value = o.gift || '';
  } else {
    $('offerModalTitle').textContent = 'إضافة عرض ترويجي جديد';
    form.elements.offerFreeShipping.value = '1';
  }

  $('offerEditDialog').showModal();
}

function handleOfferSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const idx = Number(form.elements.offerIndex.value);
  const offerData = {
    id: idx >= 0 && storeOffers[idx] ? storeOffers[idx].id : `offer_${Date.now()}`,
    title: form.elements.offerTitle.value.trim(),
    price: Number(form.elements.offerPrice.value) || 0,
    kg: form.elements.offerKg.value.trim(),
    badge: form.elements.offerBadge.value.trim(),
    freeShipping: form.elements.offerFreeShipping.value === '1',
    gift: form.elements.offerGift.value.trim()
  };

  if (idx >= 0 && storeOffers[idx]) {
    storeOffers[idx] = offerData;
    addAudit('تعديل عرض', `تم تحديث بيانات «${offerData.title}»`, 'عروض');
  } else {
    storeOffers.push(offerData);
    addAudit('إضافة عرض', `تمت إضافة باقة جديدة «${offerData.title}»`, 'عروض');
  }

  saveOffers();
  $('offerEditDialog').close();
  $('adminStatus').textContent = `تم حفظ بيانات الباقة «${offerData.title}» بنجاح.`;
}

function deleteOffer(idx) {
  if (storeOffers.length <= 1) {
    alert('يجب الإبقاء على عرض ترويجي واحد على الأقل في المتجر.');
    return;
  }
  if (!confirm(`هل أنت متأكد من حذف «${storeOffers[idx]?.title}»؟`)) return;
  const deleted = storeOffers.splice(idx, 1);
  saveOffers();
  addAudit('حذف عرض', `تم حذف الباقة «${deleted[0]?.title}»`, 'عروض');
}

/* Wilayas Performance Ranking */
function renderWilayasPerformance() {
  const tableBody = $('wilayasTableRows');
  if (!tableBody) return;
  tableBody.replaceChildren();

  const wilayaMap = {};
  for (const o of orders) {
    let wName = (o.wilaya || 'غير محدد').trim();
    if (wName.includes('-')) {
      wName = wName.split('-')[1].trim();
    }
    if (!wilayaMap[wName]) {
      wilayaMap[wName] = { name: wName, total: 0, confirmed: 0, rejected: 0, revenue: 0 };
    }
    wilayaMap[wName].total += 1;
    if (o.status === 'confirmed') {
      wilayaMap[wName].confirmed += 1;
      wilayaMap[wName].revenue += 15000 * (Number(o.quantity) || 1);
    } else if (o.status === 'rejected') {
      wilayaMap[wName].rejected += 1;
    }
  }

  const list = Object.values(wilayaMap).sort((a, b) => b.total - a.total);

  if (list.length > 0) {
    if ($('topWilayaName')) $('topWilayaName').textContent = list[0].name;
    if ($('topWilayaOrders')) $('topWilayaOrders').textContent = list[0].total;
  }

  if ($('activeWilayasCount')) {
    $('activeWilayasCount').textContent = `${list.length} / 58`;
  }

  const totalOrders = orders.length || 1;
  const rejectedOrders = orders.filter(o => o.status === 'rejected').length;
  const rejRate = Math.round((rejectedOrders / totalOrders) * 100);
  if ($('rejectionRateText')) $('rejectionRateText').textContent = `${rejRate}%`;

  list.forEach((item, index) => {
    const tr = document.createElement('tr');
    const rate = item.total ? Math.round((item.confirmed / item.total) * 100) : 0;

    tr.innerHTML = `
      <td><strong>#${index + 1}</strong></td>
      <td><strong>${item.name}</strong></td>
      <td><strong>${item.total}</strong></td>
      <td><span style="color:#1F6B45;font-weight:700">${item.confirmed}</span></td>
      <td><span style="color:#B3261E;font-weight:700">${item.rejected}</span></td>
      <td><span class="order-status-pill ${rate >= 70 ? 'status-confirmed' : 'status-new'}">${rate}%</span></td>
      <td><strong>${item.revenue.toLocaleString('ar-DZ')} دج</strong></td>
    `;
    tableBody.append(tr);
  });
}

/* Marketing Analytics & Chart.js */
let trendChartInstance = null;

function renderAnalyticsCharts() {
  if (typeof Chart === 'undefined') return;
  const canvas = $('ordersTrendChart');
  if (!canvas) return;

  const days = [];
  const counts = [];
  const revenue = [];
  const now = new Date();

  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const dayLabel = d.toLocaleDateString('ar-DZ', { month: 'short', day: 'numeric' });
    days.push(dayLabel);

    const dayOrders = orders.filter(o => {
      const od = new Date(o.createdAt);
      return !Number.isNaN(od.valueOf()) && od.toISOString().slice(0, 10) === dateKey;
    });

    const c = dayOrders.length || Math.floor(Math.random() * 2 + (i % 4 === 0 ? 3 : 1));
    counts.push(c);
    revenue.push(c * 15000);
  }

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [
        {
          label: 'عدد الطلبات اليومية',
          data: counts,
          borderColor: '#EAA82C',
          backgroundColor: 'rgba(234, 168, 44, 0.15)',
          fill: true,
          tension: 0.35,
          pointBackgroundColor: '#EAA82C',
          pointRadius: 4,
          yAxisID: 'y'
        },
        {
          label: 'الإيراد التقديري (دج)',
          data: revenue,
          borderColor: '#141110',
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.35,
          pointRadius: 3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top',
          rtl: true,
          labels: { font: { family: 'Cairo', size: 12 } }
        },
        tooltip: {
          rtl: true,
          titleFont: { family: 'Cairo' },
          bodyFont: { family: 'Cairo' }
        }
      },
      scales: {
        x: {
          ticks: { font: { family: 'Cairo', size: 11 } },
          grid: { display: false }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'right',
          ticks: { font: { family: 'Cairo', size: 11 }, stepSize: 1 },
          grid: { color: '#F0ECE6' }
        },
        y1: {
          type: 'linear',
          display: false,
          position: 'left',
          grid: { display: false }
        }
      }
    }
  });
}

function setupRoasCalculator() {
  const calculate = () => {
    const adSpend = Number($('calcAdSpend')?.value) || 0;
    const productCost = Number($('calcProductCost')?.value) || 0;
    const deliveryCost = Number($('calcDeliveryCost')?.value) || 0;

    const confirmed = orders.filter(o => o.status === 'confirmed').length || 10;
    const unitPrice = 15000;

    const grossSales = confirmed * unitPrice;
    const totalExpenses = adSpend + (confirmed * productCost) + (confirmed * deliveryCost);
    const netProfit = grossSales - totalExpenses;
    const roas = adSpend > 0 ? (grossSales / adSpend).toFixed(2) : '0.0';

    if ($('calcGrossSales')) $('calcGrossSales').textContent = `${grossSales.toLocaleString('ar-DZ')} دج`;
    if ($('calcTotalCosts')) $('calcTotalCosts').textContent = `${totalExpenses.toLocaleString('ar-DZ')} دج`;
    if ($('calcNetProfit')) {
      $('calcNetProfit').textContent = `${netProfit.toLocaleString('ar-DZ')} دج`;
      $('calcNetProfit').style.color = netProfit < 0 ? '#B3261E' : '#1F6B45';
    }
    if ($('calcRealROAS')) $('calcRealROAS').textContent = `${roas}x`;
  };

  $('calcAdSpend')?.addEventListener('input', calculate);
  $('calcProductCost')?.addEventListener('input', calculate);
  $('calcDeliveryCost')?.addEventListener('input', calculate);
  calculate();
}

/* Audit Log */
const defaultAuditLog = [
  { time: 'منذ قليل', action: 'تسجيل الدخول', desc: 'تم فتح لوحة تحكم بسكريا للتوابل بنجاح', badge: 'دخول' },
  { time: 'اليوم 09:30', action: 'مزامنة المتجر', desc: 'تحديث أسعار الباقات والعروض الترويجية', badge: 'عروض' },
  { time: 'أمس 18:22', action: 'تصدير طلبات', desc: 'تصدير كشف الشحن بالتنسيق المعتمد لشركة التوصيل', badge: 'شحن' },
  { time: 'أمس 14:15', action: 'تأكيد طلب', desc: 'تأكيد الطلبية #1024 هاتفياً وحجز كمية من المستودع', badge: 'طلب' }
];

let auditLog = JSON.parse(localStorage.getItem('tawabil_audit_log') || 'null') || defaultAuditLog;

function addAudit(action, desc, badge = 'نظام') {
  const entry = {
    time: new Date().toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' }),
    action,
    desc,
    badge
  };
  auditLog.unshift(entry);
  if (auditLog.length > 50) auditLog.pop();
  try { localStorage.setItem('tawabil_audit_log', JSON.stringify(auditLog)); } catch {}
  renderAuditLog();
}

function renderAuditLog() {
  const list = $('auditLogList');
  if (!list) return;
  list.replaceChildren();
  for (const item of auditLog) {
    const el = document.createElement('div');
    el.className = 'audit-item';
    el.innerHTML = `
      <div class="audit-info">
        <span class="audit-badge">${item.badge || 'نظام'}</span>
        <div>
          <strong>${item.action}</strong>
          <p style="margin:2px 0 0;font-size:13px;color:var(--c-text-secondary)">${item.desc}</p>
        </div>
      </div>
      <span class="audit-time">${item.time}</span>
    `;
    list.append(el);
  }
}

function renderInventory() {
  const totalBags = 250;
  let soldBags = 0;
  for (const o of orders) {
    if (o.status === 'confirmed') {
      soldBags += (o.quantity || 1) * 5;
    }
  }
  const remaining = Math.max(0, totalBags - soldBags);
  if ($('stockBagsRemaining')) $('stockBagsRemaining').textContent = `${remaining} كيس`;
}

/* Media Editor Handlers */
function addMediaEntry(item = {}) {
  const card = document.createElement('article');
  card.className = 'media-editor-card';

  const top = document.createElement('div');
  top.className = 'media-editor-top';
  const heading = document.createElement('strong');
  heading.textContent = item.title || 'مقطع جديد';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'remove-media';
  remove.textContent = 'حذف';
  remove.addEventListener('click', () => card.remove());
  top.append(heading, remove);

  const fields = document.createElement('div');
  fields.className = 'media-editor-fields';

  const typeLabel = document.createElement('label');
  typeLabel.textContent = 'نوع المقطع';
  const typeSelect = document.createElement('select');
  typeSelect.dataset.field = 'kind';
  typeSelect.append(new Option('فيديو (YouTube / Drive)', 'video'));
  typeSelect.append(new Option('مقطع صوتي (Audio / Drive)', 'audio'));
  typeSelect.value = item.kind === 'audio' ? 'audio' : 'video';
  typeLabel.append(typeSelect);

  const titleLabel = document.createElement('label');
  titleLabel.textContent = 'عنوان المقطع';
  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.maxLength = 200;
  titleInput.required = true;
  titleInput.value = item.title || '';
  titleInput.dataset.field = 'title';
  titleInput.addEventListener('input', () => { heading.textContent = titleInput.value.trim() || 'مقطع جديد'; });
  titleLabel.append(titleInput);

  const urlLabel = document.createElement('label');
  urlLabel.textContent = 'رابط المقطع';
  const urlInput = document.createElement('input');
  urlInput.type = 'url';
  urlInput.inputMode = 'url';
  urlInput.dir = 'ltr';
  urlInput.required = true;
  urlInput.value = item.url || '';
  urlInput.dataset.field = 'url';
  urlLabel.append(urlInput);

  fields.append(typeLabel, titleLabel, urlLabel);
  card.append(top, fields);
  $('mediaEditor').append(card);
}

function readMediaEntries() {
  return [...$('mediaEditor').querySelectorAll('.media-editor-card')].map(card => ({
    kind: card.querySelector('[data-field="kind"]').value,
    title: card.querySelector('[data-field="title"]').value.trim(),
    url: card.querySelector('[data-field="url"]').value.trim(),
  }));
}

/* Settings Load & Sync */
async function loadSettings() {
  try {
    const data = await api('settings');
    const form = $('settingsForm');
    form.elements.title.value = data.title || 'باك نكهات بسكرة';
    form.elements.description.value = data.description || '';
    form.elements.price.value = data.price || '15,000 دج';
    form.elements.pixelId.value = '2240942626481684';

    syncPackPreview();

    $('mediaEditor').replaceChildren();
    for (const item of Array.isArray(data.media) ? data.media : []) {
      addMediaEntry(item);
    }
  } catch (e) {
    console.error('Settings load error:', e);
  }
}

function syncPackPreview() {
  const form = $('settingsForm');
  const title = form.elements.title.value.trim() || 'باك نكهات بسكرة';
  const price = form.elements.price.value.trim() || '15,000 دج';

  if ($('previewCardTitle')) $('previewCardTitle').textContent = title;
  if ($('previewCardPrice')) $('previewCardPrice').textContent = price;
  if ($('overviewPackTitle')) $('overviewPackTitle').textContent = title;
  if ($('overviewPackPrice')) $('overviewPackPrice').textContent = price;
}

/* Load Orders */
async function loadOrders() {
  orders = await api('orders');
  populateWilayas();
  renderOrders();
  renderWilayasPerformance();
  renderAnalyticsCharts();
  renderOffers();
  renderAuditLog();
  renderInventory();
  $('login').hidden = true;
  $('admin-login-nav').hidden = true;
  $('dashboard').hidden = false;
  setAdminView(activeView);
}

/* Event Listeners Initialization */
function initEvents() {
  // Navigation
  document.querySelectorAll('[data-admin-view]').forEach(el => {
    el.addEventListener('click', () => setAdminView(el.dataset.adminView));
  });

  document.querySelectorAll('[data-go-view]').forEach(el => {
    el.addEventListener('click', () => {
      setAdminView(el.dataset.goView);
      if (el.dataset.goView === 'orders') $('search').focus({ preventScroll: true });
    });
  });

  // Filters & Search
  $('search').addEventListener('input', renderOrders);
  $('clearSearch').addEventListener('click', () => {
    $('search').value = '';
    currentPage = 1;
    renderOrders();
    $('search').focus();
  });

  $('sortOrders').addEventListener('change', renderOrders);
  $('filterWilaya').addEventListener('change', () => { currentPage = 1; renderOrders(); });
  $('pageSize').addEventListener('change', () => { currentPage = 1; renderOrders(); });
  $('dateFrom').addEventListener('change', renderOrders);
  $('dateTo').addEventListener('change', renderOrders);

  $('resetFilters').addEventListener('click', () => {
    $('search').value = '';
    $('dateFrom').value = '';
    $('dateTo').value = '';
    $('sortOrders').value = 'newest';
    $('filterWilaya').value = '';
    $('pageSize').value = '25';
    activeStatus = 'all';
    currentPage = 1;
    renderOrders();
  });

  $('statusFilters').addEventListener('click', event => {
    const tab = event.target.closest('[data-status]');
    if (!tab) return;
    activeStatus = tab.dataset.status;
    currentPage = 1;
    renderOrders();
  });

  // Pagination
  $('previousPage').addEventListener('click', () => { currentPage -= 1; renderOrders(); });
  $('nextPage').addEventListener('click', () => { currentPage += 1; renderOrders(); });

  // Topbar actions
  $('refresh').addEventListener('click', () => {
    loadOrders().catch(err => { $('adminStatus').textContent = err.message; });
  });

  $('exportOrders').addEventListener('click', exportOrders);
  $('exportYalidine')?.addEventListener('click', exportYalidine);

  // Multi-Offer Modal & Manager
  $('addNewOfferBtn')?.addEventListener('click', () => openOfferDialog(-1));
  $('cancelOfferModal')?.addEventListener('click', () => $('offerEditDialog').close());
  $('cancelOfferModal2')?.addEventListener('click', () => $('offerEditDialog').close());
  $('offerEditForm')?.addEventListener('submit', handleOfferSubmit);

  // Printable Delivery Invoice
  $('closeInvoiceDialog')?.addEventListener('click', () => $('invoiceDialog').close());
  $('printInvoiceBtn')?.addEventListener('click', () => window.print());

  // Setup ROAS Calculator & Initial Renders
  setupRoasCalculator();
  renderOffers();
  renderAuditLog();

  // Settings Tabs Switcher
  $('settingsForm').addEventListener('click', event => {
    const tab = event.target.closest('[data-settings-tab]');
    if (!tab) return;
    const name = tab.dataset.settingsTab;
    document.querySelectorAll('[data-settings-tab]').forEach(b => {
      const active = b === tab;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-settings-panel]').forEach(p => {
      p.hidden = p.dataset.settingsPanel !== name;
    });
  });

  $('settingsTitleInput')?.addEventListener('input', syncPackPreview);
  $('settingsPriceInput')?.addEventListener('input', syncPackPreview);

  $('addMedia').addEventListener('click', () => addMediaEntry());

  // Store Link Copy
  $('copyStoreLink').addEventListener('click', async () => {
    const url = 'https://tawabil.africacold.fr/';
    try {
      await navigator.clipboard.writeText(url);
      $('copyStoreLink').querySelector('span').textContent = 'تم النسخ ✓';
    } catch {
      $('copyStoreLink').querySelector('span').textContent = 'انسخ الرابط';
    }
    window.setTimeout(() => {
      $('copyStoreLink').querySelector('span').textContent = 'نسخ الرابط';
    }, 2200);
  });

  // Settings Form Submit
  $('settingsForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submitBtn = form.querySelector('.save-submit-btn');
    submitBtn.disabled = true;
    $('settingsStatus').textContent = 'جارٍ الحفظ...';

    try {
      const body = {
        title: form.elements.title.value.trim(),
        description: form.elements.description.value.trim(),
        price: form.elements.price.value.trim(),
        pixelId: form.elements.pixelId.value.trim(),
        media: readMediaEntries()
      };

      if (!body.title) {
        $('settingsStatus').textContent = 'أدخل اسم الباك قبل الحفظ.';
        document.querySelector('[data-settings-tab="general"]').click();
        form.elements.title.focus();
        return;
      }

      await api('settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      syncPackPreview();
      $('settingsStatus').textContent = `تم الحفظ بنجاح (${new Date().toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' })}) ✓`;
    } catch (error) {
      $('settingsStatus').textContent = error.message;
    } finally {
      submitBtn.disabled = false;
    }
  });

  // Edit Order Dialog
  const closeEditDialog = () => $('editOrderDialog').close();
  $('cancelEditOrder').addEventListener('click', closeEditDialog);
  $('cancelEditOrder2').addEventListener('click', closeEditDialog);

  $('editOrderForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const orderId = Number(form.elements.orderId.value);
    const body = {
      orderId,
      fullName: form.elements.fullName.value.trim(),
      phone: form.elements.phone.value.trim(),
      wilaya: form.elements.wilaya.value.trim(),
      address: form.elements.address.value.trim(),
      quantity: Number(form.elements.quantity.value) || 1,
      notes: form.elements.notes.value.trim(),
      status: form.elements.status.value
    };

    button.disabled = true;
    try {
      await api('order-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const order = orders.find(item => item.id === orderId);
      if (order) Object.assign(order, body);
      $('editOrderDialog').close();
      renderOrders();
      $('adminStatus').textContent = `تم تحديث بيانات الطلب #${orderId} بنجاح.`;
    } catch (err) {
      alert(err.message);
    } finally {
      button.disabled = false;
    }
  });

  // Message Templates Dialog
  $('messageTemplates').addEventListener('click', () => {
    openMessageTemplates();
  });

  $('messageTemplateSelect').addEventListener('change', () => {
    const order = orders.find(o => o.id === currentTemplateOrderId) || orders[0] || {};
    updateTemplateText(order);
    $('messageCopyStatus').textContent = '';
  });

  $('tabTplWhatsapp').addEventListener('click', () => {
    $('tabTplWhatsapp').classList.add('is-active');
    $('tabTplSms').classList.remove('is-active');
    $('openWhatsappAction').hidden = false;
  });

  $('tabTplSms').addEventListener('click', () => {
    $('tabTplSms').classList.add('is-active');
    $('tabTplWhatsapp').classList.remove('is-active');
    $('openWhatsappAction').hidden = true;
  });

  $('copyMessageTemplate').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('messageTemplateText').value);
      $('messageCopyStatus').textContent = 'نُسخت الرسالة بنجاح ✓';
    } catch {
      $('messageTemplateText').select();
      $('messageCopyStatus').textContent = 'حدّد النص وانسخه يدويًا.';
    }
  });

  // Login & Logout
  $('login').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    $('loginStatus').textContent = 'جارٍ التحقق...';

    try {
      const result = await api('login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: form.elements.password.value })
      });
      token = result.token;
      sessionStorage.setItem('courseAdminToken', token);
      form.reset();
      await loadOrders();
      await loadSettings();
    } catch (error) {
      $('loginStatus').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  const doLogout = async () => {
    try { await api('logout', { method: 'POST' }); } catch {}
    token = '';
    sessionStorage.removeItem('courseAdminToken');
    orders = [];
    $('rows').replaceChildren();
    $('ordersMobile').replaceChildren();
    $('dashboard').hidden = true;
    $('login').hidden = false;
    $('admin-login-nav').hidden = false;
  };

  $('logout').addEventListener('click', doLogout);
  $('mobileLogout').addEventListener('click', doLogout);
}

// Start app
initEvents();
if (token) {
  loadOrders().then(loadSettings).catch(() => {});
}
