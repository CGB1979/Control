import { pushHistory } from "./storage.js";
import { minutesFromTime, timeFromMinutes } from "./utils.js";
import { CONFIG } from "./config.js";

export function registerCurrentTime(state,key,type) {
  const time=new Intl.DateTimeFormat("es-AR",{hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
  return registerTime(state,key,type,time,false);
}

export function registerTime(state,key,type,time,isManual=true) {
  if(!/^\d{2}:\d{2}$/.test(time)) throw new Error("Hora inválida.");
  const [h,m]=time.split(":").map(Number);
  if(h>23||m>59) throw new Error("Hora inválida.");
  if(!state.records[key]) state.records[key]={};
  const old=state.records[key][type]||null;
  state.records[key][type]=time;
  state.records[key].updatedAt=new Date().toISOString();
  pushHistory(state,{
    type:isManual?"manual-time":"time",
    date:key,
    field:type,
    oldValue:old,
    newValue:time
  });
  return time;
}

export function clearTime(state,key,type) {
  if(!state.records[key]) return;
  const old=state.records[key][type]||null;
  delete state.records[key][type];
  pushHistory(state,{type:"clear-time",date:key,field:type,oldValue:old});
}

export function suggestReferenceEntry(state, beforeDateKey) {
  const keys=Object.keys(state.records).filter(k=>k<beforeDateKey).sort().reverse().slice(0,12);
  const mins=[];
  for(const key of keys){
    const t=state.records[key]?.entry;
    if(t) mins.push(minutesFromTime(t));
  }
  if(mins.length<3) return null;
  mins.sort((a,b)=>a-b);
  return timeFromMinutes(mins[Math.floor(mins.length/2)]);
}

export function getShiftStatus(state,key) {
  const entry=state.records[key]?.entry;
  if(!entry) return {status:"none"};
  const reference=suggestReferenceEntry(state,key);
  if(!reference) return {status:"unknown"};
  const delta=minutesFromTime(entry)-minutesFromTime(reference);
  if(delta>0 && delta<=CONFIG.MARGEN_LLEGADA_TARDE_MINUTOS) {
    return {status:"possible-late",reference,delta};
  }
  if(delta>CONFIG.MARGEN_LLEGADA_TARDE_MINUTOS) {
    return {status:"possible-shift-or-late",reference,delta};
  }
  return {status:"normal",reference,delta};
}
