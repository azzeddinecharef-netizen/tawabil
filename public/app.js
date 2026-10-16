const API = 'https://cawroeqwtuxfmaqxuypd.supabase.co/functions/v1/course-api';
const $ = id => document.getElementById(id);

const META_PIXEL_ID = '2240942626481684';

function initializeMetaPixel(value) {
  const metaPixelId = String(value || '').trim();
  if (!/^\d{6,20}$/.test(metaPixelId) || window.fbq) return;
  !function(f,b,e,v,n,t,s) {
    if (f.fbq) return;
    n = f.fbq = function() { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    t = b.createElement(e); t.async = true; t.src = v;
    s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  window.fbq('init', metaPixelId);
  window.fbq('track', 'PageView');
}

// Start tracking independently of the settings request.
initializeMetaPixel(META_PIXEL_ID);

function readMetaCookie(name) {
  const prefix = `${name}=`;
  const value = document.cookie.split(';').map(part => part.trim()).find(part => part.startsWith(prefix));
  if (!value) return '';
  try { return decodeURIComponent(value.slice(prefix.length)); } catch { return ''; }
}
function driveId(value) {
  try {
    const url = new URL(value);
    if (!/(^|\.)drive\.google\.com$/i.test(url.hostname)) return '';
    return url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || url.searchParams.get('id') || '';
  } catch { return ''; }
}
function embedUrl(value, kind) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (kind === 'video') {
      let id = '';
      if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
      else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) id = url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts)\/([\w-]{11})/)?.[1] || '';
      if (/^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    const file = driveId(value);
    if (file) return `https://drive.google.com/file/d/${encodeURIComponent(file)}/preview`;
  } catch {}
  return '';
}
function mediaCard(item, index) {
  const card = document.createElement('article'); card.className = 'elb-media-card';
  const frame = document.createElement('div'); frame.className = `elb-media-frame${item.kind === 'audio' ? ' audio' : ''}`;
  const title = String(item.title || (item.kind === 'audio' ? 'رسالة صوتية' : 'فيديو الباك')).slice(0, 200);
  if (item.kind === 'video') {
    const src = embedUrl(item.url, 'video');
    const player = document.createElement(src ? 'iframe' : 'video'); player.src = src || item.url; player.title = title;
    if (src) { player.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'; player.allowFullscreen = true; player.referrerPolicy = 'strict-origin-when-cross-origin'; }
    else { player.controls = true; player.preload = 'metadata'; }
    frame.append(player);
  } else {
    const file = driveId(item.url);
    const player = document.createElement(file ? 'iframe' : 'audio'); player.src = file ? `https://drive.google.com/file/d/${encodeURIComponent(file)}/preview` : item.url; player.title = title;
    if (file) player.allow = 'autoplay'; else { player.controls = true; player.preload = 'none'; player.setAttribute('aria-label', title); }
    frame.append(player);
  }
  const info = document.createElement('div'); info.className = 'elb-media-info';
  const tag = document.createElement('span'); tag.textContent = `${item.kind === 'audio' ? 'مقطع صوتي' : 'فيديو'} ${String(index + 1).padStart(2, '0')}`;
  const heading = document.createElement('h3'); heading.textContent = title;
  info.append(tag, heading); card.append(frame, info); return card;
}

fetch(`${API}?route=settings`).then(async response => {
  const result = await response.json(); if (!response.ok) throw Error(result.error); return result;
}).then(settings => {
  if (settings.title) document.title = `${settings.title} | البسكرية للتوابل`;
  if (settings.description) { const description = document.querySelector('.elb-lead'); if (description) description.textContent = settings.description; }
  const items = Array.isArray(settings.media) ? settings.media.filter(item => item && ['video', 'audio'].includes(item.kind) && item.url) : [];
  if (items.length) { $('mediaGrid').replaceChildren(...items.map(mediaCard)); $('elb-media').hidden = false; }
}).catch(() => {});

const form = $('elb-form');
const offerInputs = [...form.querySelectorAll('input[name="offers"]')];
const selectedOffer = () => offerInputs.find(input => input.checked) || offerInputs[0];
const refreshTotal = () => {
  const offer = selectedOffer();
  $('elb-total').textContent = `${offer.dataset.price} دج`;
  $('elb-ship').textContent = offer.dataset.free === '1' ? 'التوصيل مجاني مع عرض 5 أكياس.' : 'سعر التوصيل للكيس الواحد نأكدوه معاك في المكالمة حسب ولايتك.';
};
offerInputs.forEach(input => input.addEventListener('change', refreshTotal));

const wilayas = window.ELB_DZ || [];
const wilayaSelect = $('f-wilaya');
const communeSelect = $('f-commune');
const otherWrap = $('w-commune-other');
const otherInput = $('f-commune-other');
wilayas.forEach(wilaya => wilayaSelect.add(new Option(`${String(wilaya[0]).padStart(2, '0')} - ${wilaya[1]}`, String(wilaya[0]))));
wilayaSelect.addEventListener('change', () => {
  const wilaya = wilayas.find(item => String(item[0]) === wilayaSelect.value);
  communeSelect.replaceChildren(new Option(wilaya ? 'اختر البلدية' : 'اختر الولاية أولاً', ''));
  communeSelect.disabled = !wilaya;
  if (wilaya) {
    wilaya[2].slice().sort((a, b) => a.localeCompare(b, 'ar')).forEach(commune => communeSelect.add(new Option(commune, commune)));
    communeSelect.add(new Option('بلدية أخرى (اكتبها)', '__other'));
  }
  otherWrap.hidden = true;
});
communeSelect.addEventListener('change', () => { otherWrap.hidden = communeSelect.value !== '__other'; if (!otherWrap.hidden) otherInput.focus(); });

form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('elb-submit');
  const status = $('elb-form-msg');
  status.className = 'elb-form-msg'; status.textContent = '';
  if (form.elements.website.value) return;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const phone = form.elements.phone.value.trim().replace(/[\s().-]/g, '');
  if (!/^0[567]\d{8}$/.test(phone)) { status.textContent = 'تحقق من رقم الهاتف؛ يجب أن يتكون من 10 أرقام ويبدأ بـ 05 أو 06 أو 07.'; $('f-phone').focus(); return; }
  const wilaya = wilayas.find(item => String(item[0]) === wilayaSelect.value);
  const commune = communeSelect.value === '__other' ? otherInput.value.trim() : communeSelect.value;
  if (!wilaya || !commune) { status.textContent = 'اختر الولاية والبلدية لإتمام الطلب.'; return; }
  const offer = selectedOffer();
  const offerTitle = offer.dataset.label;
  const eventId = crypto.randomUUID();
  const order = {
    fullName: form.elements.name.value.trim(),
    phone,
    wilaya: `${String(wilaya[0]).padStart(2, '0')} - ${wilaya[1]}`,
    address: `${form.elements.address.value.trim()}، ${commune}`,
    quantity: offer.value === 'pack5' ? 5 : 1,
    notes: `العرض: ${offerTitle} | الوزن: ${offer.dataset.kg} كلغ | المجموع: ${offer.dataset.price} دج | التوصيل: ${offer.dataset.free === '1' ? 'مجاني' : 'يحدد عند الاتصال'}`,
    consent: form.elements.consent.checked,
    metaConsent: form.elements.consent.checked,
    eventId,
    fbp: readMetaCookie('_fbp'),
    fbc: readMetaCookie('_fbc')
  };
  button.disabled = true; button.textContent = 'جارٍ إرسال الطلب…';
  try {
    const response = await fetch(`${API}?route=orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(order) });
    const result = await response.json(); if (!response.ok) throw Error(result.error);
    form.hidden = true; $('elb-thanks-phone').textContent = phone; $('elb-thanks').hidden = false; $('elb-thanks').focus();
    // Fire only after the order has been accepted; never send form fields to Meta.
    if (window.fbq) window.fbq('track', 'Lead', {}, { eventID: result.eventId || eventId });
    const sticky = document.querySelector('.elb-sticky'); if (sticky) sticky.style.display = 'none';
  } catch (error) {
    status.textContent = error.message || 'تعذر إرسال الطلب. حاول مجددًا.';
  } finally { button.disabled = false; button.textContent = 'تأكيد الطلب'; }
});

const sticky = document.querySelector('.elb-sticky');
const orderSection = $('elb-order');
if (sticky && orderSection && 'IntersectionObserver' in window) {
  new IntersectionObserver(entries => sticky.classList.toggle('is-hidden', entries[0].isIntersecting)).observe(orderSection);
}


