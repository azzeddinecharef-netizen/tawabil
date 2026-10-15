import { createClient } from 'npm:@supabase/supabase-js@2';

const originAllowlist = new Set([
  'https://azzeddinecharef-netizen.github.io',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]);
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// Keep compatibility with the name already used in the project's Supabase dashboard.
const adminPassword = Deno.env.get('ADMIN_PASSWORD') ?? Deno.env.get('DMIN_PASSWORD') ?? '';
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
    const { data, error } = await db.from('course_settings').select('title,description,price,media').eq('id', true).single();
    return error ? fail(request, 'تعذر تحميل محتوى الباك.', 503) : reply(request, data);
  }
  if (path === 'orders' && request.method === 'POST') {
    const body = await json(request);
    if (!body || !validText(body.fullName, 200) || !validText(body.phone, 25) || body.phone.replace(/\D/g, '').length < 8 || !validText(body.wilaya, 100) || !validText(body.address, 300) || !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 99 || !validText(body.notes ?? '', 1000, true) || body.consent !== true) {
      return fail(request, 'تحقق من بيانات الطلب والكمية والموافقة على التواصل.', 400);
    }
    const { error } = await db.from('orders').insert({ full_name: body.fullName.trim(), phone: body.phone.trim(), wilaya: body.wilaya.trim(), address: body.address.trim(), quantity: body.quantity, notes: (body.notes ?? '').trim() });
    return error ? fail(request, 'تعذر حفظ الطلب الآن. حاول مجددًا.', 503) : reply(request, { ok: true }, 201);
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
    const { data, error } = await db.from('orders').select('id,full_name,phone,wilaya,address,quantity,notes,created_at').order('created_at', { ascending: false }).limit(1000);
    if (error) return fail(request, 'تعذر تحميل الطلبات.', 503);
    return reply(request, data.map((order) => ({ id: order.id, fullName: order.full_name, phone: order.phone, wilaya: order.wilaya, address: order.address, quantity: order.quantity, notes: order.notes, createdAt: order.created_at })));
  }
  if (path === 'settings' && request.method === 'POST') {
    if (!await authorized(request)) return fail(request, 'انتهت الجلسة. سجّل الدخول مجددًا.', 401);
    const body = await json(request);
    if (!body || !validText(body.title, 200) || !validText(body.description, 3000) || !validText(body.price ?? '', 100, true) || !Array.isArray(body.media) || !body.media.every(validMedia)) {
      return fail(request, 'تحقق من عنوان الباك ووصفه والسعر وروابط المقاطع.', 400);
    }
    const media = body.media.map((item: any) => ({ kind: item.kind, title: item.title.trim(), url: item.url.trim() }));
    const { error } = await db.from('course_settings').update({ title: body.title.trim(), description: body.description.trim(), price: (body.price ?? '').trim(), media, updated_at: new Date().toISOString() }).eq('id', true);
    return error ? fail(request, 'تعذر حفظ محتوى الباك.', 503) : reply(request, { ok: true });
  }
  return fail(request, 'المسار غير موجود.', 404);
});
