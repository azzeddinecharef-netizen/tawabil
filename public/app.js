const $ = id => document.getElementById(id);
const API = 'https://cawroeqwtuxfmaqxuypd.supabase.co/functions/v1/course-api';

function driveFileId(value) {
  try {
    const url = new URL(value);
    if (!/(^|\.)drive\.google\.com$/.test(url.hostname)) return '';
    return url.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || url.searchParams.get('id') || '';
  } catch { return ''; }
}

function embeddedVideoUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    else if (['youtube.com','m.youtube.com','youtube-nocookie.com'].includes(host)) id = url.searchParams.get('v') || url.pathname.match(/\/(?:embed|shorts)\/([\w-]{11})/)?.[1] || '';
    if (/^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    const driveId = driveFileId(value);
    if (driveId) return `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview`;
  } catch {}
  return '';
}

function mediaCard(item, index) {
  const article = document.createElement('article');
  article.className = 'media-card';
  const frame = document.createElement('div');
  frame.className = item.kind === 'audio' ? 'media-frame audio-frame' : 'media-frame';
  const title = String(item.title || (item.kind === 'audio' ? 'رسالة صوتية' : 'فيديو الباك')).slice(0, 200);
  if (item.kind === 'video') {
    const embed = embeddedVideoUrl(item.url);
    const video = document.createElement(embed ? 'iframe' : 'video');
    video.src = embed || item.url;
    video.title = title;
    if (embed) { video.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'; video.allowFullscreen = true; video.referrerPolicy = 'strict-origin-when-cross-origin'; }
    else { video.controls = true; video.preload = 'metadata'; }
    frame.append(video);
  } else {
    const driveId = driveFileId(item.url);
    const player = document.createElement(driveId ? 'iframe' : 'audio');
    player.src = driveId ? `https://drive.google.com/file/d/${encodeURIComponent(driveId)}/preview` : item.url;
    player.title = title;
    if (driveId) player.allow = 'autoplay';
    else { player.controls = true; player.preload = 'none'; player.setAttribute('aria-label', title); }
    frame.append(player);
  }
  const info = document.createElement('div'); info.className = 'media-info';
  const type = document.createElement('span'); type.className = 'media-type'; type.textContent = item.kind === 'audio' ? `مقطع صوتي ${String(index + 1).padStart(2,'0')}` : `فيديو ${String(index + 1).padStart(2,'0')}`;
  const heading = document.createElement('h3'); heading.textContent = title;
  info.append(type, heading); article.append(frame, info); return article;
}

fetch(`${API}/settings`).then(async response => { const result = await response.json(); if (!response.ok) throw Error(result.error); return result; }).then(settings => {
  if (settings.title) { $('productTitle').innerHTML = `${escapeHtml(settings.title).replace(/،/g, '،<br>')}`; document.title = `${settings.title} | نكهة بسكرة`; }
  if (settings.description) $('productDescription').textContent = settings.description;
  if (settings.price) { $('productPrice').textContent = settings.price; $('priceBox').hidden = false; }
  const items = Array.isArray(settings.media) ? settings.media.filter(item => item && ['video','audio'].includes(item.kind) && item.url) : [];
  if (items.length) $('mediaGrid').replaceChildren(...items.map(mediaCard));
}).catch(() => {});

function escapeHtml(value) { const el = document.createElement('span'); el.textContent = value; return el.innerHTML; }

const quantity = $('quantity');
$('qtyMinus').addEventListener('click', () => { quantity.value = String(Math.max(1, Number(quantity.value || 1) - 1)); });
$('qtyPlus').addEventListener('click', () => { quantity.value = String(Math.min(99, Number(quantity.value || 1) + 1)); });

$('orderForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('button[type="submit"]'), status = $('formStatus');
  button.disabled = true; status.className = ''; status.textContent = 'جارٍ إرسال طلبك…';
  const data = Object.fromEntries(new FormData(form)); data.quantity = Number(data.quantity); data.consent = form.elements.consent.checked;
  try {
    const response = await fetch(`${API}/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await response.json(); if (!response.ok) throw Error(result.error);
    form.reset(); quantity.value = '1'; status.textContent = 'وصلنا طلبك بنجاح. سنتواصل معك هاتفيًا لتأكيده، شكرًا لثقتك!';
  } catch (error) { status.className = 'error'; status.textContent = error.message || 'تعذر إرسال الطلب. حاول مجددًا.'; }
  finally { button.disabled = false; }
});
