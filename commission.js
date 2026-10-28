'use strict';
// Integer virtual chips: floor(positive net profit * 5%). Refunds are never taxed.
function applyCommission(g){
 if(g.commissionApplied)return;
 g.commissions=[];
 for(const p of g.players){
  const profit=p.chips-p.startingStack;
  if(!Number.isSafeInteger(profit)||profit<=0)continue;
  const amount=Math.floor(profit/20);if(!amount)continue;
  p.chips-=amount;g.commissions.push({userId:p.userId,amount});
  let remaining=amount;
  for(const award of g.awards.filter(a=>a.userId===p.userId&&!a.refund)){
   const fee=Math.min(remaining,award.amount);award.grossAmount=award.amount;award.fee=fee;award.amount-=fee;remaining-=fee;
  }
  if(remaining)throw Error('Commission award mismatch');
 }
 g.commissionApplied=true;
 g.message=g.awards.map(a=>a.name+' +'+a.amount+' · '+a.hand+(a.fee?' · fee '+a.fee:'')).join(' / ');
 if(g.logs.length)g.logs[0]=g.message;
}
module.exports={applyCommission};
