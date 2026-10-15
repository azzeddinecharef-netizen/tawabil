const http=require('node:http'), fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const dir=process.env.DATA_DIR||path.join(__dirname,'storage');fs.mkdirSync(dir,{recursive:true});
const db=new DatabaseSync(path.join(dir,'course.sqlite'));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS registrations(id INTEGER PRIMARY KEY,firstName TEXT,lastName TEXT,phone TEXT,email TEXT,wilaya TEXT,birthDate TEXT,profession TEXT,createdAt TEXT); CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,value TEXT)');
const defaults={title:'خطوتك الأولى نحو مهارة جديدة',description:'مساحة للتعلّم والتطبيق، تبدأ بالتعرّف على الدورة وتنتهي بخطوتك الأولى. هذا محتوى تجريبي يمكنك تغييره من لوحة الإدارة.',video:'',audio1:'',audio2:''};
const sessions=new Map(), attempts=new Map();
if(!process.env.ADMIN_PASSWORD)throw Error('ADMIN_PASSWORD must be set before starting the server');
const passwordHash=crypto.createHash('sha256').update(process.env.ADMIN_PASSWORD).digest();
function settings(){return JSON.parse(db.prepare('SELECT value FROM settings WHERE id=1').get()?.value||JSON.stringify(defaults))}
function authenticated(req){const token=(req.headers.cookie||'').split('; ').find(x=>x.startsWith('session='))?.slice(8);return token&&sessions.get(token)>Date.now()}
function json(res,status,data,extra={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...extra});res.end(JSON.stringify(data))}
async function body(req){let str='';for await(const part of req){str+=part;if(Buffer.byteLength(str)>16000)throw Error('حجم الطلب كبير جدًا');}return JSON.parse(str||'{}')}
const server=http.createServer(async(req,res)=>{try{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; media-src 'self' https:; frame-src https://www.youtube-nocookie.com https://player.vimeo.com; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
 const route=new URL(req.url,'http://localhost').pathname;
 if(route==='/health'&&req.method==='GET')return json(res,200,{ok:true});
 if(req.method==='POST'&&((req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)||req.headers['sec-fetch-site']==='cross-site'))return json(res,403,{error:'طلب غير مسموح'});
 if(route==='/api/settings'&&req.method==='GET')return json(res,200,settings());
 if(route==='/api/login'&&req.method==='POST'){
  const key=req.socket.remoteAddress; const now=Date.now();let entry=attempts.get(key);if(!entry||entry.until<now){entry={count:0,until:now+900000};attempts.set(key,entry)}
  if(entry.count>=10)return json(res,429,{error:'محاولات كثيرة. حاول بعد 15 دقيقة.'});entry.count++;
  const data=await body(req);if(!crypto.timingSafeEqual(passwordHash,crypto.createHash('sha256').update(String(data.password||'')).digest()))return json(res,401,{error:'كلمة المرور غير صحيحة'});
  attempts.delete(key);for(const [k,v] of sessions)if(v<now)sessions.delete(k);const token=crypto.randomBytes(32).toString('hex');sessions.set(token,now+28800000);
  return json(res,200,{ok:true},{'Set-Cookie':`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${process.env.COOKIE_SECURE==='1'?'; Secure':''}`});
 }
 if(route==='/api/logout'&&req.method==='POST'){const token=(req.headers.cookie||'').split('; ').find(x=>x.startsWith('session='))?.slice(8);sessions.delete(token);return json(res,200,{ok:true},{'Set-Cookie':'session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'})}
 if(route==='/api/registrations'&&req.method==='POST'){
  const data=await body(req),fields=['firstName','lastName','phone','email','wilaya','birthDate','profession'];
  for(const k of fields)if(typeof data[k]!=='string'||!data[k].trim()||data[k].length>200)return json(res,400,{error:'يرجى ملء جميع الحقول بشكل صحيح'});
  if(!/^[+\d\s()-]{8,25}$/.test(data.phone)||!/^\S+@\S+\.\S+$/.test(data.email))return json(res,400,{error:'تحقق من رقم الهاتف والبريد الإلكتروني'});
  const birth=new Date(data.birthDate);if(!/^\d{4}-\d{2}-\d{2}$/.test(data.birthDate)||!Number.isFinite(birth.getTime())||birth.toISOString().slice(0,10)!==data.birthDate||data.birthDate<'1900-01-01'||birth>new Date())return json(res,400,{error:'تاريخ الميلاد غير صحيح'});
  if(data.consent!==true)return json(res,400,{error:'الموافقة على التواصل مطلوبة'});
  db.prepare('INSERT INTO registrations(firstName,lastName,phone,email,wilaya,birthDate,profession,createdAt) VALUES(?,?,?,?,?,?,?,?)').run(...fields.map(k=>data[k].trim()),new Date().toISOString());return json(res,201,{ok:true});
 }
 if(route==='/api/registrations'&&req.method==='GET'){if(!authenticated(req))return json(res,401,{error:'يلزم تسجيل الدخول'});return json(res,200,db.prepare('SELECT * FROM registrations ORDER BY id DESC').all())}
 if(route==='/api/settings'&&req.method==='POST'){
  if(!authenticated(req))return json(res,401,{error:'يلزم تسجيل الدخول'});const data=await body(req),clean={};
  for(const k of Object.keys(defaults)){if(typeof data[k]!=='string'||data[k].length>3000)return json(res,400,{error:'بيانات غير صالحة'});clean[k]=data[k].trim()}
  if(!clean.title||!clean.description)return json(res,400,{error:'أدخل عنوان الدورة ووصفها'});
  for(const k of ['video','audio1','audio2'])if(clean[k]){try{if(new URL(clean[k]).protocol!=='https:')throw Error()}catch{return json(res,400,{error:'استخدم روابط وسائط صحيحة تبدأ بـ https://'})}}
  db.prepare('INSERT OR REPLACE INTO settings(id,value) VALUES(1,?)').run(JSON.stringify(clean));return json(res,200,{ok:true});
 }
 const files={'/':'index.html','/admin':'admin.html','/style.css':'style.css','/mobile.css':'mobile.css','/app.js':'app.js','/admin.js':'admin.js'};
 if(req.method==='GET'&&files[route]){const file=files[route];res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8','Cache-Control':'no-cache'});return res.end(fs.readFileSync(path.join(__dirname,'public',file)))}
 json(res,404,{error:'الصفحة غير موجودة'});
 }catch(e){json(res,400,{error:'تعذر إتمام الطلب. تحقق من البيانات وحاول مجددًا.'})}});
server.listen(Number(process.env.PORT||4173),process.env.HOST||'127.0.0.1',()=>console.log(`Local: http://localhost:${server.address().port}`));
