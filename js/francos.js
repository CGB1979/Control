import { createId, pushHistory } from "./storage.js";

export function generateSundayCredit(state,key) {
  if (state.dayOffCredits.some(x=>x.sourceDate===key && x.kind==="full" && x.status==="available")) return false;
  state.dayOffCredits.push({
    id:createId("franco"),
    kind:"full",
    sourceDate:key,
    generatedAt:new Date().toISOString(),
    status:"available",
    usedDate:null
  });
  return true;
}

export function generateHalfCredit(state,key) {
  if (state.halfDayCredits.some(x=>x.sourceDate===key && x.status==="available")) return false;
  state.halfDayCredits.push({
    id:createId("medio"),
    sourceDate:key,
    generatedAt:new Date().toISOString(),
    status:"available",
    usedDate:null
  });
  return true;
}

export function syncGeneratedCredits(state) {
  for(const [key,record] of Object.entries(state.records)){
    if(!record?.entry || !record?.exit) continue;
    const date=new Date(key+"T00:00:00");
    if(date.getDay()===0) generateSundayCredit(state,key);
    const adj=state.dayAdjustments[key];
    if(date.getDay()===6 && adj?.saturdayClass==="voluntary") generateHalfCredit(state,key);
  }
}

export function useFullCredit(state,targetDate) {
  const credit=state.dayOffCredits
    .filter(x=>x.status==="available")
    .sort((a,b)=>a.generatedAt.localeCompare(b.generatedAt))[0];
  if(!credit) return {ok:false,reason:"No hay francos enteros disponibles."};
  credit.status="used"; credit.usedDate=targetDate;
  state.dayAdjustments[targetDate]={...(state.dayAdjustments[targetDate]||{}),dayOffType:"full",creditId:credit.id};
  pushHistory(state,{type:"franco-used",date:targetDate,creditId:credit.id});
  return {ok:true};
}

export function useHalfCredit(state,targetDate) {
  const credit=state.halfDayCredits
    .filter(x=>x.status==="available")
    .sort((a,b)=>a.generatedAt.localeCompare(b.generatedAt))[0];
  if(!credit) return {ok:false,reason:"No hay medios francos disponibles."};
  credit.status="used"; credit.usedDate=targetDate;
  state.dayAdjustments[targetDate]={...(state.dayAdjustments[targetDate]||{}),dayOffType:"half",halfCreditIds:[credit.id]};
  pushHistory(state,{type:"medio-franco-used",date:targetDate,creditId:credit.id});
  return {ok:true};
}

export function useThreeHalfCredits(state,targetDate) {
  const credits=state.halfDayCredits
    .filter(x=>x.status==="available")
    .sort((a,b)=>a.generatedAt.localeCompare(b.generatedAt))
    .slice(0,3);
  if(credits.length<3) return {ok:false,reason:`Necesitás 3 medios francos disponibles. Tenés ${credits.length}.`};
  credits.forEach(c=>{c.status="used";c.usedDate=targetDate;});
  state.dayAdjustments[targetDate]={
    ...(state.dayAdjustments[targetDate]||{}),
    dayOffType:"full",
    halfCreditIds:credits.map(c=>c.id),
    coveredBy:"three-half"
  };
  pushHistory(state,{type:"three-half-used",date:targetDate,creditIds:credits.map(c=>c.id)});
  return {ok:true};
}

export function authorizeDebt(state,targetDate,kind) {
  const exists=state.debts.some(d=>d.date===targetDate && d.kind===kind && d.status==="pending");
  if(exists) return {ok:false,reason:"Ya existe una deuda pendiente para ese día."};
  state.debts.push({
    id:createId("deuda"),date:targetDate,kind,status:"pending",
    createdAt:new Date().toISOString(),compensatedAt:null
  });
  state.dayAdjustments[targetDate]={
    ...(state.dayAdjustments[targetDate]||{}),
    dayOffType:kind==="full"?"full":"half",
    debtId:state.debts.at(-1).id
  };
  pushHistory(state,{type:"debt-created",date:targetDate,debtKind:kind});
  return {ok:true};
}

export function getCreditCounts(state) {
  return {
    fullAvailable:state.dayOffCredits.filter(x=>x.status==="available").length,
    fullUsed:state.dayOffCredits.filter(x=>x.status==="used").length,
    halfAvailable:state.halfDayCredits.filter(x=>x.status==="available").length,
    halfUsed:state.halfDayCredits.filter(x=>x.status==="used").length,
    debts:state.debts.filter(x=>x.status==="pending").length
  };
}
