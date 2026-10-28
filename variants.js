'use strict';
const {Game,best,score5,compare,labels}=require('./game');
const {randomInt}=require('node:crypto');
const names={holdem:'Texas Hold’em',omaha:'Omaha',teen:'Teen Patti · seen showdown',draw:'Five-card Draw',blackjack:'Blackjack · shared-pot tournament'};
const rules={holdem:'Two hole cards, five community cards. No-limit betting. Best five cards win.',omaha:'Four hole cards. Use EXACTLY two hole cards and three community cards. No-limit betting.',teen:'Seen-hand club variant. Three private cards, equal ante, one no-limit betting round then showdown. Trail > pure sequence > sequence > colour > pair > high card. AKQ > A23 > KQJ. No blind play or sideshow.',draw:'Five private cards. Blinds and first betting round, exchange zero to three cards once, then a final betting round. Best five-card hand wins.',blackjack:'Peer tournament, not house-dealer blackjack. Equal chip entry into one shared pot. Hit or stand in turn; closest to 21 without busting wins. Natural two-card 21 beats other 21s. Ties split the pot; all bust returns entries. No split, double or insurance.'};
function omahaScore(hole,board){let out=null;for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)for(let c=0;c<3;c++)for(let d=c+1;d<4;d++)for(let e=d+1;e<5;e++){const score=score5([hole[a],hole[b],board[c],board[d],board[e]]);if(!out||compare(score,out)>0)out=score;}return out;}
function teenScore(cards){const v=cards.map(c=>'23456789TJQKA'.indexOf(c[0])+2).sort((a,b)=>b-a),same=cards.every(c=>c[1]===cards[0][1]);let run=0;if(new Set(v).size===3){if(v.join(',')==='14,13,12')run=15;else if(v.join(',')==='14,3,2')run=14;else if(v[0]-v[2]===2)run=v[0];}if(v[0]===v[2])return [5,v[0]];if(same&&run)return [4,run];if(run)return [3,run];if(same)return [2,...v];if(v[0]===v[1])return [1,v[0],v[2]];if(v[1]===v[2])return [1,v[1],v[0]];return [0,...v];}
function twentyOne(cards){let value=0,aces=0;for(const c of cards){if(c[0]==='A'){value+=11;aces++;}else value+='TJQK'.includes(c[0])?10:Number(c[0]);}while(value>21&&aces-->0)value-=10;return {value,natural:cards.length===2&&value===21,bust:value>21};}
class Variant extends Game{
 constructor(code,type){super(code);if(!names[type])throw Error('Unknown game');this.gameType=type;}
 get holeCount(){return {omaha:4,teen:3,draw:5}[this.gameType]||2;}
 rankHand(p){return this.gameType==='omaha'?omahaScore(p.cards,this.board):this.gameType==='teen'?teenScore(p.cards):this.gameType==='draw'?score5(p.cards):best([...p.cards,...this.board]);}
 handLabel(score){return this.gameType==='teen'?['High card','Pair','Colour','Sequence','Pure sequence','Trail'][score[0]]:labels[score[0]];}
 start(id){if(this.gameType==='blackjack')return this.start21(id);return super.start(id);}
 advance(){if(!['teen','draw'].includes(this.gameType))return super.advance();
  if(this.live().length===1){const p=this.live()[0],pot=this.players.reduce((n,q)=>n+q.total,0);p.chips+=pot;this.awards=[{userId:p.userId,name:p.name,amount:pot,hand:'Everyone else folded'}];return this.finish();}
  const active=this.players.filter(p=>this.actionable(p));
  if(active.some(p=>!p.acted||p.bet<this.current)){if(this.turn<0)this.turn=this.next(this.dealer,p=>this.actionable(p)&&(!p.acted||p.bet<this.current));return;}
  if(this.gameType==='teen'||this.phase==='river')return this.showdown();
  this.phase='draw';this.players.forEach(p=>{p.drawn=!p.cards.length||p.folded;});this.turn=this.next(this.dealer,p=>!p.drawn);this.message='Exchange zero to three cards once';this.setDeadline();
 }
 act(id,type,amount,discards){if(this.gameType==='blackjack')return this.act21(id,type);
  if(this.phase!=='draw')return super.act(id,type,amount);
  const p=this.players[this.turn];if(!p||p.id!==id)throw Error('It is not your turn.');if(type!=='draw')throw Error('Choose cards and exchange, or stand pat.');
  if(!Array.isArray(discards)||discards.length>3||new Set(discards).size!==discards.length||discards.some(i=>!Number.isInteger(i)||i<0||i>4))throw Error('Choose zero to three different card positions.');
  for(const index of discards)p.cards[index]=this.deck.pop();p.drawn=true;this.log(p.name+' exchanged '+discards.length+' cards');this.turn=this.next(this.turn,q=>!q.drawn);this.setDeadline();
  if(this.turn<0){this.phase='river';this.current=0;this.minRaise=this.bigBlind;this.players.forEach(p=>{p.bet=0;p.acted=false;p.lastActionBet=null;});this.turn=this.next(this.dealer,p=>this.actionable(p));this.message='Final betting round';this.advance();}
 }
 tick(){if(this.turn<0||Date.now()<=this.deadline)return;if(this.phase==='draw')return this.act(this.players[this.turn].id,'draw',0,[]);if(this.gameType==='blackjack')return this.act21(this.players[this.turn].id,'stand');super.tick();}
 start21(id){if(!this.players.some(p=>p.id===id))throw Error('Take a seat first.');if(!['waiting','showdown'].includes(this.phase))throw Error('A hand is running.');const funded=this.players.filter(p=>p.chips>0);if(funded.length<2)throw Error('Need two funded players.');this.deck=[...'23456789TJQKA'].flatMap(r=>[...'shdc'].map(s=>r+s));for(let i=51;i>0;i--){const j=randomInt(i+1);[this.deck[i],this.deck[j]]=[this.deck[j],this.deck[i]];}this.entry=Math.min(this.bigBlind,...funded.map(p=>p.chips));this.board=[];this.awards=[];this.commissions=[];this.commissionApplied=false;this.startAt=null;this.hand++;this.phase='blackjack';this.current=0;this.minRaise=0;this.dealer=this.next(this.dealer,p=>p.chips>0);
  this.players.forEach(p=>{p.startingStack=p.chips;p.cards=p.chips>0?[this.deck.pop(),this.deck.pop()]:[];p.bet=p.total=0;p.folded=!p.cards.length;p.done=!p.cards.length||twentyOne(p.cards).value===21;if(p.cards.length)this.pay(p,this.entry);});this.turn=this.next(this.dealer,p=>!p.done);this.message='Shared-pot 21 · entry '+this.entry+' · Hit or stand';this.log(this.message);this.setDeadline();if(this.turn<0)this.finish21();
 }
 act21(id,type){const p=this.players[this.turn];if(this.phase!=='blackjack'||!p||p.id!==id)throw Error('It is not your turn.');if(!['hit','stand'].includes(type))throw Error('Choose Hit or Stand.');if(type==='hit'){p.cards.push(this.deck.pop());p.done=twentyOne(p.cards).value>=21;}else p.done=true;this.log(p.name+' · '+type);if(p.done)this.turn=this.next(this.turn,q=>!q.done);this.setDeadline();if(this.turn<0)this.finish21();}
 finish21(){const live=this.players.filter(p=>p.cards.length),eligible=live.filter(p=>!twentyOne(p.cards).bust);this.awards=[];const pot=live.reduce((n,p)=>n+p.total,0);
  if(!eligible.length){for(const p of live){p.chips+=p.total;this.awards.push({userId:p.userId,name:p.name,amount:p.total,hand:'All bust: entry returned',refund:true});}}
  else{const score=p=>[twentyOne(p.cards).value,twentyOne(p.cards).natural?1:0];let top=eligible[0];for(const p of eligible)if(compare(score(p),score(top))>0)top=p;const winners=eligible.filter(p=>compare(score(p),score(top))===0);const order=[];for(let n=1;n<=this.players.length;n++){const p=this.players[(this.dealer+n)%this.players.length];if(winners.includes(p))order.push(p);}order.forEach((p,i)=>{const amount=Math.floor(pot/order.length)+(i<pot%order.length?1:0);p.chips+=amount;this.awards.push({userId:p.userId,name:p.name,amount,hand:twentyOne(p.cards).natural?'Natural blackjack':twentyOne(p.cards).value+' points'});});}
  this.finish();
 }
 view(id){const v=super.view(id);return {...v,gameType:this.gameType,gameName:names[this.gameType],rules:rules[this.gameType],entry:this.entry||null,drawTurn:this.phase==='draw'&&v.me===this.turn,canAllIn:this.gameType==='blackjack'||this.phase==='draw'?false:v.canAllIn,canRaise:this.gameType==='blackjack'||this.phase==='draw'?false:v.canRaise,players:v.players.map((p,i)=>({...p,...(this.gameType==='blackjack'&&(i===v.me||this.phase==='showdown')&&p.cards.length?{points:twentyOne(p.cards)}:{})}))};}
}
function restore(state){const type=state.gameType||'holdem';return Object.assign(Object.create(type==='holdem'?Game.prototype:Variant.prototype),state);}
module.exports={Variant,restore,names,rules,omahaScore,teenScore,twentyOne};
