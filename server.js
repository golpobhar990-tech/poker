'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
if(fs.existsSync(path.join(__dirname,'.env')))process.loadEnvFile(path.join(__dirname,'.env'));
const {openDatabase,transaction,load,save,ledger}=require('./db');const {hash,passwordHash,verifyPassword,validatePassword,limit,safeUser,validateAvatar}=require('./security');
const {uploadAvatar}=require('./uploads');
const idle=g=>['waiting','showdown'].includes(g.phase);
function createApp(db,{clock=true}={}){
 const secure=process.env.COOKIE_SECURE==='1'||process.env.NODE_ENV==='production';
 const cookie=(token,age=604800)=>`poker_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${secure?'; Secure':''}`;
 async function session(req){const m=(req.headers.cookie||'').match(/(?:^|; )poker_session=([a-f0-9]{64})(?:;|$)/);if(!m)return null;return (await db.prepare('SELECT s.token_hash,s.csrf,s.expires_at,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.deleted_at IS NULL AND u.banned=0').get(hash(m[1]),Date.now()));}
 async function newSession(id){const token=crypto.randomBytes(32).toString('hex'),csrf=crypto.randomBytes(24).toString('hex');(await db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(hash(token),id,csrf,Date.now()+7*86400000));return {token,csrf};}
 async function me(u){const current=(await db.prepare('SELECT * FROM users WHERE id=?').get(u.id)),seat=(await db.prepare('SELECT table_id FROM seats WHERE user_id=?').get(u.id));return {user:safeUser(current),csrf:u.csrf,seat:seat?.table_id||null};}
 async function getTable(id){const row=(await db.prepare('SELECT * FROM poker_tables WHERE id=?').get(Number(id)));if(!row)throw Error('Table not found.');return {row,g:load(row)};}
 async function settle(row,g){if(g.phase!=='showdown'||g.settled)return;const r=(await db.prepare('INSERT INTO hands(table_id,hand_no,board,result,created_at) VALUES(?,?,?,?,?)').run(row.id,g.hand,JSON.stringify(g.board),JSON.stringify(g.awards),Date.now()));for(const p of g.players){const net=p.chips-p.startingStack;(await db.prepare('INSERT INTO hand_players VALUES(?,?,?)').run(Number(r.lastInsertRowid),p.userId,net));(await ledger(db,p.userId,'hand_result',net,'Table '+row.name+' / hand '+g.hand+' (table stack)'));}g.settled=true;}
 async function leave(u){const seat=(await db.prepare('SELECT * FROM seats WHERE user_id=?').get(u.id));if(!seat)return;const {row,g}=(await getTable(seat.table_id));if(!idle(g))throw Error('Finish the current hand before leaving or changing tables. Back to lobby keeps your seat.');const i=g.players.findIndex(p=>p.userId===u.id);if(i<0)throw Error('Seat state mismatch.');const p=g.players[i];(await db.prepare('UPDATE users SET chips=chips + CAST(? AS BIGINT) WHERE id=?').run(p.chips,u.id));(await ledger(db,u.id,'cash_out',p.chips,row.name));g.players.splice(i,1);if(i<=g.dealer)g.dealer--;g.turn=-1;g.phase='waiting';g.board=[];g.players.forEach(p=>{p.cards=[];p.bet=p.total=0;p.folded=false;});g.startAt=g.players.filter(p=>p.chips>0).length>=2?Date.now()+5000:null;g.awards=[];g.log(u.name+' left the table');(await db.prepare('DELETE FROM seats WHERE user_id=?').run(u.id));(await save(db,row.id,g));}
 async function gameView(u){const seat=(await db.prepare('SELECT * FROM seats WHERE user_id=?').get(u.id));if(!seat)throw Error('You are not seated.');const {row,g}=(await getTable(seat.table_id));if(Date.now()-seat.last_seen>15000)(await db.prepare('UPDATE seats SET last_seen=? WHERE user_id=?').run(Date.now(),u.id));const v=g.view('user-'+u.id);return {...v,tableId:row.id,tableName:row.name,buyIn:row.buy_in,smallBlind:row.small_blind,bigBlind:row.big_blind,mode:'No-limit',host:true};}
 const server=http.createServer(async(req,res)=>{
  const json=(status,obj,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(obj));};
  try{
   const url=new URL(req.url,'http://localhost'),route=url.pathname,ip=req.socket.remoteAddress||'local';
   if(!route.startsWith('/api/')){const allowed={'/':'index.html','/app.js':'app.js','/style.css':'style.css','/responsive.css':'responsive.css','/table-base.css':'table-base.css','/avatar.svg':'avatar.svg','/admin':'admin.html','/admin.js':'admin.js'};const file=allowed[route];if(!file||req.method!=='GET'){res.writeHead(404);return res.end('Not found');}const content=fs.readFileSync(path.join(__dirname,'public',file));res.writeHead(200,{'Content-Type':file.endsWith('.html')?'text/html; charset=utf-8':file.endsWith('.js')?'application/javascript':file.endsWith('.svg')?'image/svg+xml':'text/css','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://res.cloudinary.com; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});return res.end(content);}
   if(req.headers['sec-fetch-site']==='cross-site'||req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(403,{error:'Cross-origin request rejected.'});
   (await limit(db,'traffic:'+ip,1200,60000));
   let u=(await session(req));
   if(req.method==='GET'){
    if(!u)return json(401,{error:'Please sign in.'});
    if(route==='/api/admin'){
     if(u.role!=='admin')return json(403,{error:'Administrator access required.'});
     const users=await db.prepare('SELECT id,username,email,name,avatar,chips,role,banned,created_at,deleted_at FROM users ORDER BY id DESC LIMIT 500').all();
     const tables=(await db.prepare('SELECT * FROM poker_tables ORDER BY id').all()).map(r=>{const g=load(r);return {id:r.id,name:r.name,smallBlind:r.small_blind,bigBlind:r.big_blind,buyIn:r.buy_in,players:g.players.map(p=>({userId:p.userId,name:p.name,chips:p.chips})),phase:g.phase,hand:g.hand};});
     const audit=await db.prepare('SELECT a.*,u.username FROM admin_audit a JOIN users u ON u.id=a.admin_id ORDER BY a.id DESC LIMIT 100').all();
     const hands=await db.prepare('SELECT id,table_id,hand_no,board,result,created_at FROM hands ORDER BY id DESC LIMIT 100').all();
     const ledger=await db.prepare('SELECT l.*,u.username FROM ledger l JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 200').all();
     return json(200,{users,tables,audit,hands,ledger});
    }
    if(route==='/api/me'){(await db.prepare('UPDATE seats SET last_seen=? WHERE user_id=? AND last_seen<?').run(Date.now(),u.id,Date.now()-15000));return json(200,(await me(u)));}
    if(route==='/api/tables'){const rows=(await db.prepare('SELECT * FROM poker_tables ORDER BY buy_in').all()).map(r=>{const g=load(r);return {id:r.id,name:r.name,buyIn:r.buy_in,smallBlind:r.small_blind,bigBlind:r.big_blind,players:g.players.length,phase:g.phase,limit:'No-limit',joinable:idle(g)&&g.players.length<4};});return json(200,{tables:rows});}
    if(route==='/api/state')return json(200,(await gameView(u)));
    if(route==='/api/history'){const entries=(await db.prepare('SELECT kind,amount,balance_after,reference,created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 100').all(u.id));const hands=(await db.prepare('SELECT h.table_id,h.hand_no,h.board,h.result,h.created_at,p.net FROM hands h JOIN hand_players p ON p.hand_id=h.id WHERE p.user_id=? ORDER BY h.id DESC LIMIT 30').all(u.id));return json(200,{entries,hands});}
    return json(404,{error:'Not found.'});
   }
   if(req.method!=='POST')return json(405,{error:'Method not allowed.'});
   if(req.headers['x-poker-client']!=='1'||!String(req.headers['content-type']).startsWith('application/json'))return json(403,{error:'JSON client request required.'});
   let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>230000)return json(413,{error:'Request too large.'});}let b;try{b=JSON.parse(raw||'{}');}catch{return json(400,{error:'Invalid JSON.'});}if(!b||Array.isArray(b)||typeof b!=='object')throw Error('Invalid request.');
   if(route==='/api/signup'||route==='/api/login'){
    (await limit(db,'auth:'+ip,30,15*60000));const email=String(b.email||'').trim().toLowerCase();if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw Error('Enter a valid email.');(await limit(db,'auth-email:'+hash(email),15,15*60000));const password=validatePassword(b.password);let id;
    if(route.endsWith('signup')){const username=String(b.username||'').trim().toLowerCase(),name=String(b.name||'').trim();if(!/^[a-z][a-z0-9_]{2,23}$/.test(username))throw Error('Username: 3–24 letters, digits or _, starting with a letter.');if(name.length<2||name.length>32)throw Error('Name must be 2–32 characters.');const encoded=await passwordHash(password);try{id=(await transaction(db,async()=>{const r=(await db.prepare('INSERT INTO users(username,email,name,password_hash,created_at) VALUES(?,?,?,?,?)').run(username,email,name,encoded,Date.now()));const id=Number(r.lastInsertRowid);(await ledger(db,id,'welcome',5000,'Welcome chips'));return id;}));}catch(e){if(e.code==='23505'||String(e.code).includes('CONSTRAINT')||/UNIQUE constraint/i.test(e.message))throw Error('Email or username is already registered.');throw e;}}
    else {const found=(await db.prepare('SELECT * FROM users WHERE email=? AND deleted_at IS NULL').get(email));if(!await verifyPassword(password,found?.password_hash||'')||found?.banned){return json(401,{error:'Incorrect email or password.'});}id=found.id;}
    const s=(await newSession(id));u={...(await db.prepare('SELECT * FROM users WHERE id=?').get(id)),csrf:s.csrf};return json(200,(await me(u)),{'Set-Cookie':cookie(s.token)});
   }
   if(!u)return json(401,{error:'Please sign in.'});if(req.headers['x-csrf-token']!==u.csrf)return json(403,{error:'Security token expired. Refresh and try again.'});(await limit(db,'write:'+u.id,100,60000));
   const key=String(req.headers['idempotency-key']||'');if(!/^[a-zA-Z0-9-]{16,80}$/.test(key))throw Error('A unique request key is required.');const fingerprint={...b};delete fingerprint.password;delete fingerprint.newPassword;const bodyHash=hash(JSON.stringify(fingerprint));
   const prior=(await db.prepare('SELECT * FROM operations WHERE user_id=? AND request_key=?').get(u.id,key));if(prior){if(prior.route!==route||prior.body_hash!==bodyHash)throw Error('Request key was already used.');return json(200,JSON.parse(prior.response));}
   let uploadedAvatar;
   if(route==='/api/profile'&&b.avatar!==undefined&&b.avatar!==u.avatar){uploadedAvatar=b.avatar?await uploadAvatar(validateAvatar(b.avatar),u.id):null;}
   let encoded=null;
   if(['/api/password','/api/delete-account','/api/transfer'].includes(route)){(await limit(db,'sensitive:'+u.id,15,15*60000));const good=await verifyPassword(String(b.password||''),u.password_hash);if(!good)throw Error('Current password is incorrect.');}
   if(route==='/api/password')encoded=await passwordHash(validatePassword(b.newPassword));
   const out=(await transaction(db,async()=>{
    // Recheck after async password hashing, inside the write transaction.
    const again=(await db.prepare('SELECT * FROM operations WHERE user_id=? AND request_key=?').get(u.id,key));if(again){if(again.route!==route||again.body_hash!==bodyHash)throw Error('Request key was already used.');return JSON.parse(again.response);}
    const fresh=(await db.prepare('SELECT * FROM users WHERE id=? AND deleted_at IS NULL').get(u.id));if(!fresh||fresh.banned||!(await db.prepare('SELECT 1 FROM sessions WHERE token_hash=? AND expires_at>?').get(u.token_hash,Date.now())))throw Error('Session expired.');if(encoded||route==='/api/delete-account'||route==='/api/transfer'){if(fresh.password_hash!==u.password_hash)throw Error('Password changed. Retry with the current password.');}
    let result={ok:true};
    if(route.startsWith('/api/admin/')){
     if(fresh.role!=='admin'){const e=Error('Administrator access required.');e.status=403;throw e;}
     const reason=String(b.reason||'').trim();if(reason.length<5||reason.length>300)throw Error('Provide a reason (5–300 characters).');
     if(route==='/api/admin/user'){
      const target=await db.prepare('SELECT * FROM users WHERE id=? AND deleted_at IS NULL').get(Number(b.userId));
      if(!target)throw Error('User not found.');
      if(b.action==='ban'||b.action==='unban'){
       if(target.role==='admin')throw Error('Admin accounts cannot be banned here.');
       await db.prepare('UPDATE users SET banned=? WHERE id=?').run(b.action==='ban'?1:0,target.id);
       if(b.action==='ban'){
        await db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
        const seat=await db.prepare('SELECT table_id FROM seats WHERE user_id=?').get(target.id);
        if(seat&&idle((await getTable(seat.table_id)).g))await leave(target);
       }
      }else if(b.action==='chips'){
       const delta=Number(b.amount);if(!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>1000000)throw Error('Adjustment must be a nonzero integer up to 1,000,000.');
       if(! (await db.prepare('UPDATE users SET chips=chips + CAST(? AS BIGINT) WHERE id=? AND chips + CAST(? AS BIGINT) BETWEEN 0 AND 1000000000').run(delta,target.id,delta)).changes)throw Error('Balance would be out of range.');
       await ledger(db,target.id,'admin_adjustment',delta,reason);
      }else throw Error('Unknown user action.');
     }else if(route==='/api/admin/table'){
      const {row,g}=await getTable(b.tableId);if(!idle(g)||g.players.length)throw Error('Table configuration can change only when it is empty.');
      const name=String(b.name||'').trim(),sb=Number(b.smallBlind),bb=Number(b.bigBlind),buy=Number(b.buyIn);
      if(name.length<2||name.length>50||![sb,bb,buy].every(Number.isSafeInteger)||sb<1||bb!==sb*2||buy<bb*10||buy>1000000)throw Error('Use 2–50 character name, big blind = 2 × small blind, buy-in = 10+ big blinds and at most 1,000,000.');
      g.smallBlind=sb;g.bigBlind=bb;g.limit='no-limit';
      await db.prepare('UPDATE poker_tables SET name=?,small_blind=?,big_blind=?,buy_in=? WHERE id=?').run(name,sb,bb,buy,row.id);await save(db,row.id,g);
     }else throw Error('Unknown admin operation.');
     await db.prepare('INSERT INTO admin_audit(admin_id,action,target,details,created_at) VALUES(?,?,?,?,?)').run(u.id,route+':'+(b.action||'configure'),String(b.userId||b.tableId),JSON.stringify({...b,reason}),Date.now());
     result.message='Saved. Audit record created.';
    }
    else if(route==='/api/logout'){(await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(u.token_hash));}
    else if(route==='/api/profile'){
     const name=String(b.name||'').trim();if(name.length<2||name.length>32)throw Error('Name must be 2–32 characters.');const avatar=b.avatar===undefined?fresh.avatar:b.avatar===fresh.avatar?fresh.avatar:uploadedAvatar;(await db.prepare('UPDATE users SET name=?,avatar=? WHERE id=?').run(name,avatar,u.id));const seat=(await db.prepare('SELECT table_id FROM seats WHERE user_id=?').get(u.id));if(seat){const {row,g}=(await getTable(seat.table_id)),p=g.players.find(p=>p.userId===u.id);p.name=name;p.avatar=avatar;(await save(db,row.id,g));}
    }
    else if(route==='/api/settings'){if(typeof b.sound!=='boolean'||typeof b.motion!=='boolean')throw Error('Invalid settings.');(await db.prepare('UPDATE users SET settings=? WHERE id=?').run(JSON.stringify({sound:b.sound,motion:b.motion}),u.id));}
    else if(route==='/api/password'){(await db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(encoded,u.id));(await db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(u.id,u.token_hash));}
    else if(route==='/api/delete-account'){
     if(b.confirm!=='DELETE')throw Error('Type DELETE to confirm.');if((await db.prepare('SELECT 1 FROM seats WHERE user_id=?').get(u.id)))throw Error('Leave your table and cash out before deleting your account.');const balance=fresh.chips;(await db.prepare("UPDATE users SET username=?,email=?,name='Deleted player',avatar=NULL,password_hash='',chips=0,settings='{}',deleted_at=? WHERE id=?").run('deleted_'+u.id,'deleted_'+u.id+'@local.invalid',Date.now(),u.id));(await ledger(db,u.id,'account_deleted',-balance,'Account closed'));(await db.prepare('DELETE FROM sessions WHERE user_id=?').run(u.id));(await db.prepare('DELETE FROM operations WHERE user_id=?').run(u.id));for(const t of (await db.prepare('SELECT * FROM poker_tables').all())){const g=load(t);g.logs=g.logs.map(line=>line.split(fresh.name).join('Deleted player'));g.message=g.message.split(fresh.name).join('Deleted player');for(const award of g.awards||[])if(award.name===fresh.name)award.name='Deleted player';(await save(db,t.id,g));}for(const h of (await db.prepare('SELECT h.id,h.result FROM hands h JOIN hand_players p ON p.hand_id=h.id WHERE p.user_id=?').all(u.id))){const awards=JSON.parse(h.result);for(const award of awards)if(award.name===fresh.name)award.name='Deleted player';(await db.prepare('UPDATE hands SET result=? WHERE id=?').run(JSON.stringify(awards),h.id));}(await db.prepare('UPDATE ledger SET reference=REPLACE(reference,?,?) WHERE reference LIKE ?').run('@'+fresh.username,'@deleted_'+u.id,'%@'+fresh.username+'%'));
    }
    else if(route==='/api/buy-chips'){
     const packs={starter:1000,social:2500,club:5000};const amount=packs[b.pack];if(!amount)throw Error('Unknown chip pack.');const start=new Date().setUTCHours(0,0,0,0);const daily=(await db.prepare("SELECT COALESCE(SUM(amount),0) n FROM ledger WHERE user_id=? AND kind='daily_grant' AND created_at>=?").get(u.id,start)).n;if(Number(daily)+amount>10000)throw Error('Virtual-chip allowance: 10,000 per UTC day.');(await db.prepare('UPDATE users SET chips=chips + CAST(? AS BIGINT) WHERE id=?').run(amount,u.id));(await ledger(db,u.id,'daily_grant',amount,'Free virtual-chip pack: '+b.pack));result.message=amount+' virtual chips added. Chips have no cash value.';
    }
    else if(route==='/api/transfer'){
     const amount=Number(b.amount),recipient=(await db.prepare('SELECT id,username FROM users WHERE username=? AND deleted_at IS NULL AND banned=0').get(String(b.username||'').toLowerCase().trim()));if(!Number.isSafeInteger(amount)||amount<1||amount>1000000)throw Error('Enter 1–1,000,000 chips.');if(!recipient||recipient.id===u.id)throw Error('Enter another active player’s exact username.');const spent=(await db.prepare('UPDATE users SET chips=chips - CAST(? AS BIGINT) WHERE id=? AND chips>=?').run(amount,u.id,amount));if(!spent.changes)throw Error('Insufficient wallet chips.');(await db.prepare('UPDATE users SET chips=chips + CAST(? AS BIGINT) WHERE id=?').run(amount,recipient.id));const ref=crypto.randomUUID();(await ledger(db,u.id,'transfer_out',-amount,'To @'+recipient.username+' / '+ref));(await ledger(db,recipient.id,'transfer_in',amount,'From @'+fresh.username+' / '+ref));result.message='Transferred '+amount+' chips to @'+recipient.username;
    }
    else if(route==='/api/join-table'){
     if((await db.prepare('SELECT 1 FROM seats WHERE user_id=?').get(u.id)))throw Error('Cash out of your current table before joining another.');const {row,g}=(await getTable(b.tableId));if(!idle(g))throw Error('A hand is running. Join after it finishes.');if(g.players.length>=4)throw Error('Table is full.');if(!(await db.prepare('UPDATE users SET chips=chips - CAST(? AS BIGINT) WHERE id=? AND chips>=?').run(row.buy_in,u.id,row.buy_in)).changes)throw Error('Not enough wallet chips for this buy-in.');const p=g.join(fresh.name);p.id='user-'+u.id;p.userId=u.id;p.avatar=fresh.avatar;p.chips=row.buy_in;g.limit='no-limit';if(g.players.filter(q=>q.chips>0).length>=2&&!g.startAt)g.startAt=Date.now()+5000;(await db.prepare('INSERT INTO seats VALUES(?,?,?)').run(u.id,row.id,Date.now()));(await ledger(db,u.id,'buy_in',-row.buy_in,row.name));(await save(db,row.id,g));result.tableId=row.id;
    }
    else if(route==='/api/leave-table'){(await leave(fresh));}
    else if(route==='/api/start'||route==='/api/action'){
     const seat=(await db.prepare('SELECT table_id FROM seats WHERE user_id=?').get(u.id));if(!seat)throw Error('Take a seat first.');const {row,g}=(await getTable(seat.table_id));if(b.revision!==g.revision)throw Error('Table changed. Refreshing state; try again.');if(route==='/api/start'){throw Error('Hands start automatically after the five-second countdown.');}else g.act('user-'+u.id,b.action,b.amount);(await settle(row,g));(await save(db,row.id,g));result.state=(await gameView(u));
    }
    else throw Error('Unknown operation.');
    if(route!=='/api/delete-account'&&route!=='/api/logout')result.account=(await me(u));
    (await db.prepare('INSERT INTO operations VALUES(?,?,?,?,?,?)').run(u.id,key,route,bodyHash,JSON.stringify({ok:true,replayed:true,...(result.message?{message:result.message}:{}),...(result.tableId?{tableId:result.tableId}:{})}),Date.now()));return result;
   }));
   return json(200,out,['/api/logout','/api/delete-account'].includes(route)?{'Set-Cookie':cookie('',0)}:{});
  }catch(e){const status=e.status||400;if(!e.status&&/SQLITE|database|constraint|relation |syntax error/i.test(e.message)&&!/already registered/i.test(e.message)){console.error('Database error:',e.message);res.writeHead(500,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'Database operation failed. Please retry.'}));}if(!res.headersSent)json(status,{error:e.message||'Request failed.'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 async function tick(){try{await transaction(db,async()=>{
  const now=Date.now();
  for(const row of await db.prepare('SELECT * FROM poker_tables').all()){
   let g=load(row),changed=false;
   if(g.turn>=0&&now>g.deadline){g.tick();await settle(row,g);changed=true;}
   if(idle(g)){
    if(changed){await save(db,row.id,g);changed=false;}
    const stale=await db.prepare('SELECT s.user_id FROM seats s JOIN users u ON u.id=s.user_id WHERE s.table_id=? AND (s.last_seen<? OR u.banned=1)').all(row.id,now-5*60000);
    for(const seat of stale)await leave({id:seat.user_id,name:'Inactive player'});
    g=(await getTable(row.id)).g;
    if(g.players.filter(p=>p.chips>0).length>=2){
     if(!g.startAt){g.startAt=now+5000;changed=true;}
     else if(now>=g.startAt){g.limit='no-limit';g.start(g.players.find(p=>p.chips>0).id);await settle(row,g);changed=true;}
    }else if(g.startAt){g.startAt=null;changed=true;}
   }
   if(changed)await save(db,row.id,g);
  }
  await db.prepare('DELETE FROM sessions WHERE expires_at<?').run(now);
  await db.prepare('DELETE FROM rate_limits WHERE reset_at<?').run(now);
  await db.prepare('DELETE FROM operations WHERE created_at<?').run(now-7*86400000);
 });}catch(e){console.error('Table clock:',e.message);}}
 const timer=clock?setInterval(tick,1000):null;timer?.unref();server.on('close',()=>clearInterval(timer));return {server,db,tick};
}
if(require.main===module){openDatabase().then(db=>{const app=createApp(db);app.server.listen(Number(process.env.PORT)||5000,'0.0.0.0',()=>console.log('Poker Four Club → http://localhost:'+(process.env.PORT||5000)+'\nDatabase: PostgreSQL'));
 let stopping=false;const shutdown=()=>{if(stopping)return;stopping=true;const deadline=setTimeout(()=>process.exit(1),15000);deadline.unref();app.server.close(async()=>{try{await db.close();process.exit(0);}catch{process.exit(1);}});};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}).catch(e=>{console.error(e.message);process.exit(1);});}
module.exports={createApp};
