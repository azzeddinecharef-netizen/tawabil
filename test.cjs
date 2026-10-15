const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const fs=require('node:fs'),path=require('node:path');
test('registration, authentication, persistence and content settings',async()=>{
 const testPassword='test-only-password';
 const dir=fs.mkdtempSync(path.join(__dirname,'storage-test-'));let child;let base;let cookie;
 async function start(){child=spawn(process.execPath,['server.cjs'],{cwd:__dirname,env:{...process.env,PORT:'0',DATA_DIR:dir,ADMIN_PASSWORD:testPassword}});await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Server timeout')),10000);child.once('error',reject);child.stdout.on('data',chunk=>{const match=String(chunk).match(/http:\/\/localhost:\d+/);if(match){base=match[0];clearTimeout(timeout);resolve()}})});}
 async function stop(){if(child.exitCode===null){const ended=new Promise(r=>child.once('exit',r));child.kill();await ended}}
 async function request(route,data,auth=false){return fetch(base+route,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(auth?{cookie}:{})},...(data?{body:JSON.stringify(data)}:{})})}
 try{await start();assert.equal((await request('/')).status,200);assert.equal((await request('/admin')).status,200);assert.equal((await request('/api/registrations')).status,401);assert.equal((await request('/api/login',{password:'wrong'})).status,401);
 const login=await request('/api/login',{password:testPassword});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];assert.match(login.headers.get('set-cookie'),/HttpOnly/);
 const person={firstName:'اختبار',lastName:'تجريبي',phone:'0555123456',email:'test@example.com',wilaya:'الجزائر',birthDate:'1995-06-15',profession:'طالب',consent:true};
 assert.equal((await request('/api/registrations',{...person,birthDate:'1995-02-31'})).status,400);assert.equal((await request('/api/registrations',{...person,consent:false})).status,400);assert.equal((await request('/api/registrations',person)).status,201);
 const rows=await(await request('/api/registrations',null,true)).json();assert.equal(rows.length,1);assert.equal(rows[0].firstName,person.firstName);assert.equal(rows[0].profession,person.profession);
 const settings={title:'دورة اختبار',description:'وصف تجريبي',video:'',audio1:'',audio2:''};assert.equal((await request('/api/settings',settings)).status,401);assert.equal((await request('/api/settings',settings,true)).status,200);assert.equal((await(await request('/api/settings')).json()).title,settings.title);
 const cross=await fetch(base+'/api/settings',{method:'POST',headers:{'Content-Type':'application/json',cookie,Origin:'https://other.example'},body:JSON.stringify(settings)});assert.equal(cross.status,403);
 await stop();await start();const relog=await request('/api/login',{password:testPassword});cookie=relog.headers.get('set-cookie').split(';')[0];assert.equal((await(await request('/api/registrations',null,true)).json()).length,1);assert.equal((await(await request('/api/settings')).json()).title,settings.title);
 await request('/api/logout',{},true);assert.equal((await request('/api/registrations',null,true)).status,401);
 }finally{await stop();for(const file of fs.readdirSync(dir))fs.unlinkSync(path.join(dir,file));fs.rmdirSync(dir)}
});
