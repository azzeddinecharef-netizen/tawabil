import { createClient } from 'npm:@supabase/supabase-js@2';

const originAllowlist = new Set([
  'https://azzeddinecharef-netizen.github.io',
  'https://tawabil.africacold.fr',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// Keep compatibility with the name already used in the project's Supabase dashboard.
const adminPassword = Deno.env.get('ADMIN_PASSWORD') ?? Deno.env.get('DMIN_PASSWORD') ?? '';
const META_PIXEL_ID = '2240942626481684';
const metaCapiAccessToken = Deno.env.get('META_CAPI_ACCESS_TOKEN') ?? '';
const metaCapiTestEventCode = Deno.env.get('META_CAPI_TEST_EVENT_CODE') ?? '';
const metaGraphApiVersion = Deno.env.get('META_GRAPH_API_VERSION') ?? 'v26.0';
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const loginAttempts = new Map<string, { count: number; expires: number }>();
const encoder = new TextEncoder();

function cors(request: Request) {
  const origin = request.headers.get('origin') ?? '';
  return {
    'Access-Control-Allow-Origin': originAllowlist.has(origin) ? origin : 'https://azzeddinecharef-netizen.github.io',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
}
function reply(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(request) });
}
function fail(request: Request, message: string, status: number) {
  return reply(request, { error: message }, status);
}
async function json(request: Request) {
  try { return await request.json(); } catch { return null; }
}
function validText(value: unknown, max: number, optional = false) {
  return optional && value === '' || typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
}
function validHttpsUrl(value: unknown) {
  if (typeof value !== 'string' || value.length > 2000) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
}
function validMedia(item: any) {
  if (!item || !['video', 'audio'].includes(item.kind) || !validText(item.title, 200) || !validHttpsUrl(item.url)) return false;
  let url: URL;
  try { url = new URL(item.url); } catch { return false; }
  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (item.kind === 'video') {
    return ['youtube.com','m.youtube.com','youtu.be','youtube-nocookie.com','drive.google.com'].includes(host);
  }
  return true;
}
async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function normalizeName(value: string) {
  return value.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\p{L}\p{N}]/gu, '');
}
function normalizeAlgerianPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('0') ? `213${digits.slice(1)}` : digits;
}
function validMetaCookie(value: unknown, prefix: string) {
  return typeof value === 'string' && value.length <= 200 && value.startsWith(prefix) && /^[\w.:-]+$/.test(value) ? value : '';
}
async function sendMetaLead(request: Request, body: any, eventId: string, pixelId: string) {
  if (!metaCapiAccessToken || !/^\d{6,20}$/.test(pixelId)) return;
  const names = body.fullName.trim().split(/\s+/);
  const userData: Record<string, unknown> = {
    ph: [await sha256(normalizeAlgerianPhone(body.phone))],
    client_user_agent: request.headers.get('user-agent') ?? '',
  };
  const clientIp = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '';
  if (clientIp) userData.client_ip_address = clientIp;
  if (names[0]) userData.fn = await sha256(normalizeName(names[0]));
  if (names.length > 1) userData.ln = await sha256(normalizeName(names.slice(1).join(' ')));
  const fbp = validMetaCookie(body.fbp, 'fb.1.');
  const fbc = validMetaCookie(body.fbc, 'fb.1.');
  if (fbp) userData.fbp = fbp;
  if (fbc) userData.fbc = fbc;

  const origin = request.headers.get('origin') ?? 'https://tawabil.africacold.fr';
  const payload: Record<string, unknown> = {
    data: [{
      event_name: 'Lead',
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: `${origin}/`,
      user_data: userData,
    }],
  };
  if (metaCapiTestEventCode) payload.test_event_code = metaCapiTestEventCode;
  const endpoint = new URL(`https://graph.facebook.com/${metaGraphApiVersion}/${pixelId}/events`);
  endpoint.searchParams.set('access_token', metaCapiAccessToken);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.error('Meta CAPI Lead delivery failed:', response.status);
  } catch {
    // Order acceptance must not fail if Meta's tracking endpoint is unavailable.
    console.error('Meta CAPI Lead delivery failed: network error');
  }
}
async function authorized(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  if (!token || token.length < 32) return false;
  const tokenHash = await hashToken(token);
  const { data } = await db.from('admin_sessions').select('token_hash').eq('token_hash', tokenHash).gt('expires_at', new Date().toISOString()).maybeSingle();
  return Boolean(data);
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
  if (!originAllowlist.has(request.headers.get('origin') ?? '')) return fail(request, 'مصدر الطلب غير مسموح.', 403);
  if (!supabaseUrl || !serviceKey) return fail(request, 'الخدمة غير مكتملة الإعداد.', 503);

  const requestUrl = new URL(request.url);
  // Supabase's gateway may strip subpaths after the function name. Pass routes as a query value.
  const path = requestUrl.searchParams.get('route') ?? requestUrl.pathname.split('/').filter(Boolean).at(-1) ?? '';
  if (path === 'settings' && request.method === 'GET') {
    const { data, error } = await db.from('course_settings').select('title,description,price,media,pixel_id').eq('id', true).single();
    return error ? fail(request, 'تعذر تحميل محتوى الباك.', 503) : reply(request, { title: data.title, description: data.description, price: data.price, media: data.media, pixelId: META_PIXEL_ID });
  }
  if (path === 'orders' && request.method === 'POST') {
    const body = await json(request);
    if (!body || !validText(body.fullName, 200) || !validText(body.phone, 25) || body.phone.replace(/\D/g, '').length < 8 || !validText(body.wilaya, 100) || !validText(body.address, 300) || !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 99 || !validText(body.notes ?? '', 1000, true) || body.consent !== true) {
      return fail(request, 'تحقق من بيانات الطلب والكمية والموافقة على التواصل.', 400);
    }
    const { error } = await db.from('orders').insert({ full_name: body.fullName.trim(), phone: body.phone.trim(), wilaya: body.wilaya.trim(), address: body.address.trim(), quantity: body.quantity, notes: (body.notes ?? '').trim() });
    if (error) return fail(request, 'تعذر حفظ الطلب الآن. حاول مجددًا.', 503);
    const eventId = typeof body.eventId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.eventId) ? body.eventId : '';
    // Legacy pages keep working; only opted-in updated clients use server tracking.
    if (eventId && body.metaConsent === true) {
      try {
        await sendMetaLead(request, body, eventId, META_PIXEL_ID);
      } catch { console.error('Meta CAPI tracking unavailable; order saved'); }
    }
    return reply(request, { ok: true, ...(eventId ? { eventId } : {}) }, 201);
  }
  if (path === 'login' && request.method === 'POST') {
    if (!adminPassword) return fail(request, 'لم يكتمل إعداد كلمة مرور الإدارة.', 503);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    const now = Date.now();
    const attempt = loginAttempts.get(ip);
    if (attempt && attempt.expires > now && attempt.count >= 10) return fail(request, 'محاولات كثيرة. حاول بعد قليل.', 429);
    const body = await json(request);
    if (!body || typeof body.password !== 'string' || body.password !== adminPassword) {
      if (!attempt || attempt.expires <= now) loginAttempts.set(ip, { count: 1, expires: now + 15 * 60 * 1000 });
      else loginAttempts.set(ip, { count: attempt.count + 1, expires: attempt.expires });
      return fail(request, 'كلمة المرور غير صحيحة. تحقق من السر ADMIN_PASSWORD أو DMIN_PASSWORD.', 401);
    }
    loginAttempts.delete(ip);
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = [...tokenBytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const { error } = await db.from('admin_sessions').insert({ token_hash: await hashToken(token), expires_at: new Date(now + 8 * 60 * 60 * 1000).toISOString() });
    return error ? fail(request, 'تعذر بدء جلسة الإدارة. تحقق من إعداد قاعدة البيانات.', 503) : reply(request, { token });
  }
  if (path === 'logout' && request.method === 'POST') {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (token) await db.from('admin_sessions').delete().eq('token_hash', await hashToken(token));
    return reply(request, { ok: true });
  }
  if (path === 'orders' && request.method === 'GET') {
    if (!await authorized(request)) return fail(request, 'انتهت الجلسة. سجّل الدخول مجددًا.', 401);
    const { data, error } = await db.from('orders').select('id,full_name,phone,wilaya,address,quantity,notes,status,created_at').order('created_at', { ascending: false }).limit(1000);
    if (error) return fail(request, 'تعذر تحميل الطلبات.', 503);
    return reply(request, data.map((order) => ({ id: order.id, fullName: order.full_name, phone: order.phone, wilaya: order.wilaya, address: order.address, quantity: order.quantity, notes: order.notes, status: order.status, createdAt: order.created_at })));
  }
  if (path === 'order-status' && request.method === 'POST') {
    if (!await authorized(request)) return fail(request, 'انتهت الجلسة. سجّل الدخول مجددًا.', 401);
    const body = await json(request);
    if (!body || !Number.isSafeInteger(body.orderId) || body.orderId < 1 || !['new', 'confirmed', 'rejected'].includes(body.status)) return fail(request, 'تحقق من رقم الطلب والحالة الجديدة.', 400);
    const { data, error } = await db.from('orders').update({ status: body.status }).eq('id', body.orderId).select('id').maybeSingle();
    if (error) return fail(request, 'تعذر تحديث حالة الطلب.', 503);
    return data ? reply(request, { ok: true }) : fail(request, 'لم يتم العثور على هذا الطلب.', 404);
  }
    if (path === 'order-delete' && request.method === 'POST') {
    if (!await authorized(request)) return fail(request, 'انتهت الجلسة. سجّل الدخول مجددًا.', 401);
    const body = await json(request);
    if (!body || !Number.isSafeInteger(body.orderId) || body.orderId < 1) return fail(request, 'تحقق من رقم الطلب.', 400);
    const { data, error } = await db.from('orders').delete().eq('id', body.orderId).select('id').maybeSingle();
    if (error) return fail(request, 'تعذر حذف الطلب.', 503);
    return data ? reply(request, { ok: true }) : fail(request, 'لم يتم العثور على هذا الطلب.', 404);
  }
  if (path === 'order-update' && request.method === 'POST') {
    if (!await authorized(request)) return fail(request, 'انتهت الجلسة. سجّل الدخول مجددًا.', 401);
    const body = await json(request);
    if (!body || !Number.isSafeInteger(body.orderId) || body.orderId < 1 || !validText(body.fullName, 200) || !validText(body.phone, 25) || body.phone.replace(/\D/g, '').length < 8 || !validText(body.wilaya, 100) || !validText(body.address, 300) || !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 99 || !validText(body.notes ?? '', 1000, true) || !['new', 'confirmed', 'rejected'].includes(body.status)) {
      return fail(request, 'تحقق من بيانات الطلب والكمية والحالة.', 400);
    }
    const { data, error } = await db.from('orders').update({ full_name: body.fullName.trim(), phone: body.phone.trim(), wilaya: body.wilaya.trim(), address: body.address.trim(), quantity: body.quantity, notes: (body.notes ?? '').trim(), status: body.status }).eq('id', body.orderId).select('id').maybeSingle();
    if (error) return fail(request, 'تعذر حفظ تعديلات الطلب.', 503);
    return data ? reply(request, { ok: true }) : fail(request, 'لم يتم العثور على هذا الطلب.', 404);
  }
if (path === 'settings' && request.method === 'POST') {
    if (!await authorized(request)) return fail(request, 'انتهت الجلسة. سجّل الدخول مجددًا.', 401);
    const body = await json(request);
    const pixelId = META_PIXEL_ID;
    if (!body || !validText(body.title, 200) || !validText(body.description, 3000) || !validText(body.price ?? '', 100, true) || !(pixelId === '' || typeof pixelId === 'string' && /^\d{6,20}$/.test(pixelId)) || !Array.isArray(body.media) || !body.media.every(validMedia)) {
      return fail(request, 'تحقق من عنوان الباك ووصفه والسعر ومعرّف Meta Pixel وروابط المقاطع.', 400);
    }
    const media = body.media.map((item: any) => ({ kind: item.kind, title: item.title.trim(), url: item.url.trim() }));
    const { error } = await db.from('course_settings').update({ title: body.title.trim(), description: body.description.trim(), price: (body.price ?? '').trim(), media, pixel_id: pixelId, updated_at: new Date().toISOString() }).eq('id', true);
    return error ? fail(request, 'تعذر حفظ محتوى الباك.', 503) : reply(request, { ok: true });
  }
  return fail(request, 'المسار غير موجود.', 404);
});