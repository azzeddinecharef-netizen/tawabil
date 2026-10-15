const $ = id => document.getElementById(id);
const API = 'https://cawroeqwtuxfmaqxuypd.supabase.co/functions/v1/course-api';

fetch(`${API}/settings`).then(async r => { const data = await r.json(); if (!r.ok) throw Error(data.error); return data; }).then(data => {
  $('courseTitle').textContent = data.title;
  $('courseDescription').textContent = data.description;
  document.title = data.title + ' | مسار';
  if (data.video) {
    let embed = '';
    try {
      const url = new URL(data.video);
      if (['youtube.com','www.youtube.com','m.youtube.com'].includes(url.hostname)) { const id = url.searchParams.get('v') || url.pathname.split('/').pop(); if (/^[\w-]{11}$/.test(id)) embed = 'https://www.youtube-nocookie.com/embed/' + id; }
      if (url.hostname === 'youtu.be' && /^[\w-]{11}$/.test(url.pathname.slice(1))) embed = 'https://www.youtube-nocookie.com/embed/' + url.pathname.slice(1);
      if (url.hostname === 'vimeo.com' && /^\/\d+$/.test(url.pathname)) embed = 'https://player.vimeo.com/video' + url.pathname;
    } catch {}
    const media = document.createElement(embed ? 'iframe' : 'video');
    media.src = embed || data.video; media.title = 'الفيديو التعريفي للدورة';
    if (embed) { media.allowFullscreen = true; media.allow = 'fullscreen; picture-in-picture'; } else { media.controls = true; media.preload = 'metadata'; }
    $('videoSlot').replaceChildren(media);
  }
  for (const key of ['audio1','audio2']) if (data[key]) { const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'metadata'; audio.src = data[key]; audio.setAttribute('aria-label', key === 'audio1' ? 'رسالة ترحيبية' : 'قبل أن تبدأ'); $(key).replaceChildren(audio); }
}).catch(() => { $('courseDescription').textContent = 'تعذر تحميل محتوى الدورة. أعد تحميل الصفحة.'; });

document.querySelector('[name=birthDate]').max = new Date().toISOString().slice(0, 10);
$('registrationForm').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, button = form.querySelector('button'), status = $('formStatus');
  button.disabled = true; status.className = ''; status.textContent = 'جارٍ إرسال طلبك…';
  const data = Object.fromEntries(new FormData(form)); data.consent = form.elements.consent.checked;
  try {
    const res = await fetch(`${API}/registrations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await res.json(); if (!res.ok) throw Error(result.error);
    form.reset(); status.textContent = 'تم إرسال طلبك بنجاح. شكرًا لاهتمامك! يمكن لفريق الدورة الآن الاطلاع على بياناتك والتواصل معك.';
  } catch (err) { status.className = 'error'; status.textContent = err.message || 'تعذر الإرسال. حاول مجددًا.'; }
  finally { button.disabled = false; }
});
