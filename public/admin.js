'use strict';
const $=id=>document.getElementById(id),el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
let csrf='',data=null,tab='overview',busy=false;
const fmt=v=>Number(v||0).toLocaleString(),date=v=>new Date(v).toLocaleString();
async function request(route,body){const r=await fetch('/api/'+route,{credentials:'same-origin',headers:body?{'Content-Type':'application/json','X-Poker-Client':'1','X-CSRF-Token':csrf,'Idempotency-Key':crypto.randomUUID()}:{},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const j=await r.json();if(j.csrf)csrf=j.csrf;if(!r.ok)throw Error(j.error);return j;}
async function refresh(){try{const me=await request('admin-me');if(me.user.role!=='admin')throw Error('Administrator access required. Sign in below with an administrator account.');csrf=me.csrf;data=await request('admin');$('admin-content').hidden=false;$('admin-login').hidden=true;$('admin-logout').hidden=false;$('admin-status').textContent='Updated '+new Date().toLocaleTimeString()+'. Showing latest 500 users / 100 hands / 200 ledger entries.';render();}catch(e){$('admin-content').hidden=true;$('admin-login').hidden=false;$('admin-logout').hidden=true;$('admin-status').textContent=e.message;}}
async function change(route,body){if(busy)return;const reason=prompt('Reason for this change (5–300 characters):');if(!reason)return;busy=true;try{await request(route,{...body,reason});await refresh();}catch(e){$('admin-status').textContent=e.message;}finally{busy=false;}}
function cell(tr,value){const td=el('td');if(value instanceof Node)td.append(value);else td.textContent=value??'—';tr.append(td);return td;}
function button(label,fn){const b=el('button',label);b.onclick=fn;return b;}
function render(){
 $('stats').replaceChildren();for(const [label,value] of [['Club fee balance',fmt(data.treasury.balance)],['Fee collections',fmt(data.treasury.charges)],['Member accounts',fmt(data.summary.users)],['Players seated',data.tables.reduce((n,t)=>n+t.players.length,0)],['Tables',data.tables.length],['Wallet chips',fmt(data.summary.wallets)]]){const box=el('div');box.className='panel';box.append(el('small',label),el('strong',value));$('stats').append(box);}
 $('tabs').replaceChildren();for(const name of ['overview','users','tables','fees','hands','ledger','audit']){const b=button(name[0].toUpperCase()+name.slice(1),()=>{tab=name;$('search').value='';render();});b.className=tab===name?'primary':'';$('tabs').append(b);}
 $('overview').hidden=tab!=='overview';$('data-panel').hidden=tab==='overview';
 if(tab==='overview'){renderOverview();return;}
 const titles={fees:['Hand','Player','Fee chips','Time'],users:['Player','Email','Balance','Status','Actions'],tables:['Table','Blinds','Buy-in','State','Configuration'],hands:['Hand','Table','Board','Result','Time'],ledger:['Player','Activity','Amount','Wallet balance','Reference','Time'],audit:['Admin','Action','Target','Details','Time']};
 const header=el('tr');titles[tab].forEach(t=>header.append(el('th',t)));$('head').replaceChildren(header);$('rows').replaceChildren();const q=$('search').value.toLowerCase();
 for(const r of data[tab]){if(q&&!JSON.stringify(r).toLowerCase().includes(q))continue;const tr=el('tr');
  if(tab==='users'){
   cell(tr,'#'+r.id+' · '+r.name+' (@'+r.username+')');cell(tr,r.email);cell(tr,fmt(r.chips));cell(tr,r.deleted_at?'Deleted':r.role==='admin'?'Administrator':r.banned?'Banned':'Active');const td=cell(tr,'');
   if(!r.deleted_at){td.append(button('Adjust chips',()=>{const amount=prompt('Signed virtual-chip adjustment, e.g. 500 or -500:');if(amount!==null)change('admin/user',{userId:r.id,action:'chips',amount:Number(amount)});}));if(r.role!=='admin')td.append(button(r.banned?'Unban':'Ban',()=>change('admin/user',{userId:r.id,action:r.banned?'unban':'ban'})));}
   if(!r.deleted_at&&r.role!=='admin'){
    td.append(button('Edit name / clear photo',()=>{const name=prompt('New display name (photo will be cleared):',r.name);if(name)change('admin/user',{userId:r.id,action:'profile',name});}));
    td.append(button('Revoke sessions',()=>change('admin/user',{userId:r.id,action:'revoke'})));
    td.append(button('Remove idle seat',()=>change('admin/user',{userId:r.id,action:'kick'})));
   }
  }else if(tab==='fees'){cell(tr,'#'+r.hand_id);cell(tr,'@'+r.username);cell(tr,fmt(r.amount));cell(tr,date(r.created_at));
  }else if(tab==='tables'){
   cell(tr,'#'+r.id+' · '+r.name+' / '+r.gameName);cell(tr,r.smallBlind+' / '+r.bigBlind);cell(tr,fmt(r.buyIn));cell(tr,(r.paused?'PAUSED · ':'')+r.phase+' · '+r.players.length+'/4 · Hand '+r.hand);const td=cell(tr,'');
   const form=el('form');form.className='admin-controls';const inputs={};for(const [key,value] of Object.entries({name:r.name,smallBlind:r.smallBlind,bigBlind:r.bigBlind,buyIn:r.buyIn})){const input=el('input');input.value=value;input.type=key==='name'?'text':'number';input.setAttribute('aria-label',key);input.disabled=!!r.players.length;inputs[key]=input;form.append(input);}
   const save=el('button','Save');save.disabled=!!r.players.length;form.append(save);form.onsubmit=e=>{e.preventDefault();change('admin/table',{tableId:r.id,...Object.fromEntries(Object.entries(inputs).map(([key,v])=>[key,key==='name'?v.value:Number(v.value)]))});};td.append(form,button(r.paused?'Resume table':'Pause new hands',()=>change('admin/table-pause',{tableId:r.id,paused:!r.paused})));
  }else if(tab==='hands'){cell(tr,'#'+r.id+' · '+r.hand_no);cell(tr,r.table_id);cell(tr,JSON.parse(r.board).join(' '));cell(tr,JSON.parse(r.result).map(a=>a.name+' +'+fmt(a.amount)+' ('+a.hand+(a.fee?'; fee '+fmt(a.fee):'')+')').join('; '));cell(tr,date(r.created_at));
  }else if(tab==='ledger'){cell(tr,'@'+r.username);cell(tr,r.kind);cell(tr,fmt(r.amount));cell(tr,fmt(r.balance_after));cell(tr,r.reference);cell(tr,date(r.created_at));
  }else {cell(tr,'@'+r.username);cell(tr,r.action);cell(tr,r.target);const pre=el('pre',r.details);pre.className='admin-json';cell(tr,pre);cell(tr,date(r.created_at));}
  $('rows').append(tr);
 }
 if(!$('rows').children.length){const tr=el('tr'),td=cell(tr,'No matching records.');td.colSpan=titles[tab].length;$('rows').append(tr);}
}
$('refresh').onclick=refresh;$('search').oninput=()=>data&&render();refresh();

$('admin-login').onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;try{await request('admin-login',{email:$('admin-email').value,password:$('admin-password').value});$('admin-password').value='';await refresh();}catch(e){$('admin-status').textContent=e.message;}finally{busy=false;}};
$('admin-logout').onclick=async()=>{try{await request('admin-logout',{});await refresh();}catch(e){$('admin-status').textContent=e.message;}};

function renderOverview(){const root=$('overview');root.replaceChildren();const heading=el('div');heading.className='dashboard-heading';heading.append(el('h2','The live floor'),el('p','Five games. Every chip accounted for.'));root.append(heading);const games=el('div');games.className='game-overview-grid';const icons={holdem:'♠',omaha:'♦',teen:'♣',draw:'♥',blackjack:'21'};for(const g of data.games){const card=el('article');card.className='game-overview-card';card.append(el('span',icons[g.gameType]),el('h3',g.name),el('p',g.players+' seated · '+g.tables+' tables · '+g.paused+' paused'));const fee=el('strong',fmt(g.fees));card.append(el('small','COLLECTED VIRTUAL-CHIP FEES'),fee);const b=button('Manage tables →',()=>{tab='tables';$('search').value=g.name;render();});card.append(b);games.append(card);}root.append(games);const notes=el('div');notes.className='dashboard-notes';for(const [title,body] of [['Chip policy','New members start at zero. Only administrators allocate chips. No payments or redemption.'],['Fee policy','5% of positive net hand profit, rounded down. Refunded bets and break-even hands pay no fee.'],['Access protection','Separate two-hour admin sessions, server role checks, login rate limits and a reason for every change.']]){const c=el('section');c.className='panel';c.append(el('h3',title),el('p',body));notes.append(c);}root.append(notes);}
