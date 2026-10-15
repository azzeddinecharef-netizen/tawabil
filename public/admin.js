const $ = id => document.getElementById(id);
const API = 'https://cawroeqwtuxfmaqxuypd.supabase.co/functions/v1/course-api';
let registrations = [];
let token = sessionStorage.getItem('courseAdminToken') || '';

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${API}/${path}`, { ...options, headers });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401) { token = ''; sessionStorage.removeItem('courseAdminToken'); $('dashboard').hidden = true; $('login').hidden = false; registrations = []; $('rows').replaceChildren(); }
    throw Error(data.error || 'تعذر تنفيذ الطلب.');
  }
  return data;
}
function render() {
  const term = $('search').value.trim().toLowerCase();
  const filtered = registrations.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(term)));
  $('count').textContent = `${registrations.length} طلب تسجيل`; $('rows').replaceChildren();
  for (const row of filtered) {
    const tr = document.createElement('tr');
    for (const key of ['id','firstName','lastName','birthDate','phone','email','wilaya','profession','createdAt']) {
      const td = document.createElement('td'); td.textContent = key === 'createdAt' ? new Date(row[key]).toLocaleString('ar-DZ') : row[key];
      if (['phone','email','birthDate'].includes(key)) td.dir = 'ltr'; tr.append(td);
    }
    $('rows').append(tr);
  }
  if (!filtered.length) { const tr = document.createElement('tr'), td = document.createElement('td'); td.colSpan = 9; td.textContent = registrations.length ? 'لا توجد طلبات مطابقة للبحث.' : 'لم تصل طلبات بعد. ستظهر التسجيلات الجديدة هنا.'; tr.append(td); $('rows').append(tr); }
}
async function load() {
  registrations = await api('registrations'); $('login').hidden = true; $('dashboard').hidden = false; render();
  $('adminStatus').textContent = 'آخر تحديث: ' + new Date().toLocaleTimeString('ar-DZ');
}
async function loadSettings() { const data = await api('settings'); for (const [k, v] of Object.entries(data)) $('settingsForm').elements[k].value = v; }

$('login').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, button = form.querySelector('button'); button.disabled = true;
  try {
    const result = await api('login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: form.elements.password.value }) });
    token = result.token; sessionStorage.setItem('courseAdminToken', token); form.reset(); $('loginStatus').textContent = ''; await load(); await loadSettings();
  } catch (err) { $('loginStatus').textContent = err.message; }
  finally { button.disabled = false; }
});
$('logout').onclick = async () => { try { await api('logout', { method: 'POST' }); } catch {} token = ''; sessionStorage.removeItem('courseAdminToken'); registrations = []; $('rows').replaceChildren(); $('dashboard').hidden = true; $('login').hidden = false; };
$('refresh').onclick = () => load().catch(e => $('adminStatus').textContent = e.message);
$('search').oninput = render;
$('settingsForm').onsubmit = async e => {
  e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
  try { await api('settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(e.target))) }); $('settingsStatus').textContent = 'تم حفظ المحتوى. سيظهر للزوار عند فتح الصفحة.'; }
  catch (err) { $('settingsStatus').textContent = err.message; }
  finally { button.disabled = false; }
};
if (token) load().then(loadSettings).catch(() => {});
