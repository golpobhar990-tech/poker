'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const {Game,best,compare}=require('../game');
const four=()=>{const g=new Game('1');g.limit='pot';for(let i=0;i<4;i++)g.join('Player '+i);return g;};
test('hand ranks: royal flush, wheel, full house, kicker',()=>{assert.deepEqual(best(['As','Ks','Qs','Js','Ts','2h','3d']),[8,14]);assert.deepEqual(best(['As','2h','3d','4c','5s','Kh','Qd']),[4,5]);assert.equal(best(['As','Ah','Ad','Kh','Kd','2s','3s'])[0],6);assert(compare(best(['As','Ah','Ks','Qh','9d','2s','3c']),best(['Ac','Ad','Js','Qd','9s','2h','3d']))>0);});
test('pot limit: first raise max 70; under-raise and out of turn rejected',()=>{const g=four();g.start(g.players[0].id);const p=g.players[g.turn];assert.equal(g.maxRaise(p),70);assert.throws(()=>g.act(p.id,'raise',71),/Pot-limit/);assert.throws(()=>g.act(p.id,'raise',30),/Minimum/);assert.throws(()=>g.act(g.players[(g.turn+1)%4].id,'fold'),/not your turn/);g.act(p.id,'raise',70);assert.equal(g.current,70);});
test('private cards never disclosed before showdown; four seat limit',()=>{const g=four();assert.throws(()=>g.join('fifth'));g.start(g.players[0].id);const s=g.view(g.players[0].id);assert.equal(new Set(g.players.flatMap(p=>p.cards)).size,8);assert(s.players[1].cards.every(c=>c===null));assert.equal(s.players[0].cards.filter(Boolean).length,2);assert(!JSON.stringify(s).includes('deck'));});
test('random pot-limit games conserve all chips through folds, all-ins and side pots',()=>{for(let run=0;run<100;run++){const g=four();g.players.forEach((p,i)=>p.chips=[137,551,1000,2312][i]);for(let h=0;h<12&&g.players.filter(p=>p.chips>0).length>1;h++){g.start(g.players[0].id);let n=0;while(g.phase!=='showdown'&&n++<150){const p=g.players[g.turn],r=Math.random();if(r<.12)g.act(p.id,'fold');else if(r<.5&&g.raiseOpen(p)&&g.maxRaise(p)>g.current){const target=Math.min(g.current+g.minRaise,g.maxRaise(p));if(target>=g.current+g.minRaise||target===p.chips+p.bet)g.act(p.id,'raise',target);else g.act(p.id,p.bet<g.current?'call':'check');}else g.act(p.id,p.bet<g.current?'call':'check');}assert.equal(g.phase,'showdown');assert.equal(g.players.reduce((s,p)=>s+p.chips,0),4000);assert(g.players.every(p=>p.chips>=0));}}});
test('split pot ties and exact side-pot allocations',()=>{const g=four();g.players.forEach((p,i)=>{p.total=[100,200,300,300][i];p.chips=0;p.folded=false;});g.board=['2c','3d','7h','9s','Jc'];g.players[0].cards=['As','Ah'];g.players[1].cards=['Ks','Kh'];g.players[2].cards=['Qs','Qh'];g.players[3].cards=['Ts','Th'];g.showdown();assert.deepEqual(g.players.map(p=>p.chips),[400,300,200,0]);const tie=four();tie.board=['As','Ks','Qs','Js','Ts'];tie.players.forEach((p,i)=>{p.total=100;p.chips=900;p.folded=false;p.cards=[['2h','3h'],['4h','5h'],['6h','7h'],['8h','9h']][i];});tie.showdown();assert(tie.players.every(p=>p.chips===1000));});
test('short all-in does not reopen betting, cumulative full raise does',()=>{const g=four(),p=g.players[0];g.current=120;g.minRaise=50;p.acted=true;p.lastActionBet=100;assert.equal(g.raiseOpen(p),false);g.current=150;assert.equal(g.raiseOpen(p),true);});
test('custom blinds and disconnected player timeout',()=>{const g=four();g.smallBlind=50;g.bigBlind=100;g.start(g.players[0].id);assert.equal(g.current,100);assert.equal(g.minRaise,100);const p=g.players[g.turn];g.deadline=0;g.tick();assert(p.folded);});
test('no-limit all-in exceeds pot and an unmatched excess is refunded',()=>{
 const g=new Game('all-in');const a=g.join('Alice'),b=g.join('Bob');a.chips=1000;b.chips=300;g.start(a.id);
 assert.equal(g.limit,'no-limit');const p=g.players[g.turn];assert.equal(g.view(p.id).canAllIn,true);g.act(p.id,'all-in');
 if(g.phase!=='showdown')g.act(g.players[g.turn].id,'all-in');
 assert.equal(g.phase,'showdown');assert.equal(g.players.reduce((n,p)=>n+p.chips,0),1300);
 assert(g.awards.some(a=>a.refund&&a.amount===700));
});
test('no-limit short all-in does not reopen a previous full bettor',()=>{
 const g=new Game('short');for(let i=0;i<3;i++)g.join('Player '+i);g.start(g.players[0].id);
 const a=g.players[g.turn];g.act(a.id,'raise',100);const b=g.players[g.turn];b.chips=120-b.bet;g.act(b.id,'all-in');
 const c=g.players[g.turn];g.act(c.id,'call');assert.equal(g.players[g.turn].id,a.id);assert.equal(g.view(a.id).canAllIn,false);assert.throws(()=>g.act(a.id,'all-in'),/not reopened/);g.act(a.id,'call');
});
