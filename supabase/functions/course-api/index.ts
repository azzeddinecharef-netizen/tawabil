import { createClient } from 'npm:@supabase/supabase-js@2';
const allowed = new Set(['https://azzeddinecharef-netizen.github.io', 'http://localhost:4173', 'http://127.0.0.1:4173']);
const db = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', { auth: { persistSession: false } });
const encoder = new TextEncoder();
const attempts = new Map<string, { count: number; until: number }>();
function headers(req: Request) { const o = req.headers.get('origin') || ''; return { 'Access-Control-Allow-Origin': allowed.has(o) ? o : 'https://azzeddinecharef-netizen.github.io', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Vary': 'Origin', 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }; }
function send(req: Request, data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: headers(req) }); }
function fail(req: Request, error: string, status: number) { return send(req, { error }, status); }
async function body(req: Request) { try { return await req.json(); } catch { return null; } }
async function hash(value: string) { const b = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))); return Array.from(b, x => x.toString(16).padStart(2, '0')).join(''); }
function valid(v: unknown, max: number) { return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max; }
function secureUrl(v: unknown) { if (v === '') return true; if (typeof v !== 'string' || v.length > 2000) return false; try { return new URL(v).protocol === 'https:'; } catch { return false; } }
async function auth(req: Request) { const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); if (t.length < 32) return false; const h = await hash(t); const q = await db.from('admin_sessions').select('token_hash').eq('token_hash', h).gt('expires_at', new Date().toISOString()).maybeSingle(); return Boolean(q.data); }
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (!allowed.has(req.headers.get('origin') || '')) return fail(req, 'مصدر الطلب غير مسموح.', 403);
  const p = new URL(req.url).pathname.split('/').filter(Boolean).pop() || '';
  if (p === 'settings' && req.method === 'GET') { const q = await db.from('course_settings').select('title,description,video,audio1,audio2').eq('id', true).single(); return q.error ? fail(req, 'تعذر تحميل محتوى الدورة.', 503) : send(req, q.data); }
  if (p === 'registrations' && req.method === 'POST') {
    const x = await body(req);
    if (!x || !valid(x.firstName, 200) || !valid(x.lastName, 200) || !valid(x.phone, 25) || !valid(x.email, 200) || !valid(x.wilaya, 200) || !valid(x.profession, 200) || !/^\d{4}-\d{2}-\d{2}$/.test(x.birthDate || '') || x.consent !== true) return fail(req, 'تحقق من الحقول المطلوبة والموافقة على استخدام بياناتك.', 400);
    const email = x.email.trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(req, 'أدخل بريدًا إلكترونيًا صحيحًا.', 400);
    const date = new Date(x.birthDate + 'T00:00:00Z'); if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== x.birthDate || date > new Date()) return fail(req, 'تاريخ الميلاد غير صحيح.', 400);
    const q = await db.from('registrations').insert({ first_name: x.firstName.trim(), last_name: x.lastName.trim(), phone: x.phone.trim(), email: email, wilaya: x.wilaya.trim(), birth_date: x.birthDate, profession: x.profession.trim() });
    return q.error ? fail(req, 'تعذر حفظ الطلب الآن. حاول مجددًا.', 503) : send(req, { ok: true }, 201);
  }
  if (p === 'login' && req.method === 'POST') {
    const password = Deno.env.get('ADMIN_PASSWORD') || ''; if (!password) return fail(req, 'لم يكتمل إعداد كلمة مرور الإدارة.', 503);
    const ip = (req.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim(), now = Date.now(), a = attempts.get(ip);
    if (a && a.until > now && a.count >= 10) return fail(req, 'محاولات كثيرة. حاول بعد قليل.', 429);
    const x = await body(req); if (!x || typeof x.password !== 'string' || x.password !== password) { if (!a || a.until <= now) attempts.set(ip, { count: 1, until: now + 900000 }); else attempts.set(ip, { count: a.count + 1, until: a.until }); return fail(req, 'كلمة المرور غير صحيحة.', 401); }
    attempts.delete(ip); const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    const q = await db.from('admin_sessions').insert({ token_hash: await hash(token), expires_at: new Date(now + 28800000).toISOString() }); return q.error ? fail(req, 'تعذر بدء جلسة الإدارة.', 503) : send(req, { token });
  }
  if (p === 'logout' && req.method === 'POST') { const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); if (t) await db.from('admin_sessions').delete().eq('token_hash', await hash(t)); return send(req, { ok: true }); }
  if (p === 'registrations' && req.method === 'GET') {
    if (!await auth(req)) return fail(req, 'انتهت الجلسة. سجّل الدخول مجددًا.', 401);
    const q = await db.from('registrations').select('id,first_name,last_name,birth_date,phone,email,wilaya,profession,created_at').order('created_at', { ascending: false }).limit(1000); if (q.error) return fail(req, 'تعذر تحميل الطلبات.', 503);
    return send(req, q.data.map((r: any) => ({ id: r.id, firstName: r.first_name, lastName: r.last_name, birthDate: r.birth_date, phone: r.phone, email: r.email, wilaya: r.wilaya, profession: r.profession, createdAt: r.created_at })));
  }
  if (p === 'settings' && req.method === 'POST') {
    if (!await auth(req)) return fail(req, 'انتهت الجلسة. سجّل الدخول مجددًا.', 401);
    const x = await body(req); if (!x || !valid(x.title, 200) || !valid(x.description, 3000) || !secureUrl(x.video || '') || !secureUrl(x.audio1 || '') || !secureUrl(x.audio2 || '')) return fail(req, 'تحقق من العنوان والوصف وروابط الوسائط الآمنة.', 400);
    const q = await db.from('course_settings').update({ title: x.title.trim(), description: x.description.trim(), video: x.video || '', audio1: x.audio1 || '', audio2: x.audio2 || '', updated_at: new Date().toISOString() }).eq('id', true); return q.error ? fail(req, 'تعذر حفظ إعدادات الدورة.', 503) : send(req, { ok: true });
  }
  return fail(req, 'المسار غير موجود.', 404);
});
