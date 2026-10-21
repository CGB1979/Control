import { CONFIG } from "./config.js";
import { durationMinutes, minutesFromTime, billingPeriodFor, dateRange, moneyScore } from "./utils.js";

export function calculateDay(date, record, adjustment, holiday, state = null) {
  const weekday = date.getDay();
  const rules = {
    ...CONFIG,
    ...(state?.settings || {})
  };
  const minutesReal = durationMinutes(record?.entry, record?.exit);
  const result = {
    minutesReal: minutesReal ?? 0,
    minutesComputed: 0,
    extra50: 0,
    extra100: 0,
    review: false,
    normalCompleted: false,
    type: "normal",
    lateSuspected: false
  };

  if (weekday === 0 || holiday?.paidByCompany) {
    result.type = weekday === 0 ? "domingo" : "feriado";
    if (minutesReal != null) {
      result.minutesComputed = minutesReal;
      result.extra100 = minutesReal;
      result.normalCompleted = minutesReal > 0;
    }
    return result;
  }

  if (weekday === 6) {
    result.type = adjustment?.saturdayClass || "saturday-pending";
    if (minutesReal == null) {
      result.review = false;
      return result;
    }
    if (result.type === "voluntary") {
      const split = splitSaturday(record.entry, record.exit);
      result.minutesComputed = minutesReal;
      result.extra50 = split.before13;
      result.extra100 = split.after13;
      return result;
    }

    // Si todavía no está clasificado, mostramos las horas reales pero no
    // decidimos extras definitivos hasta que se clasifique el sábado.
    if (result.type === "saturday-pending") {
      result.minutesComputed = Math.min(minutesReal, rules.JORNAL_SABADO_OBLIGATORIO*60);
      result.review = true;
      return result;
    }

    // Obligatorio: las primeras 8 h son jornal. El excedente se reparte
    // según el momento real del trabajo respecto de las 13:00.
    result.minutesComputed = Math.min(minutesReal, rules.JORNAL_SABADO_OBLIGATORIO*60);
    const split = splitSaturday(record.entry, record.exit);
    let remainingExtra = Math.max(0, minutesReal - rules.JORNAL_SABADO_OBLIGATORIO*60);
    // Priorizamos como extra el tiempo posterior al cumplimiento de 8 h,
    // conservando la ubicación horaria para decidir 50/100.
    const workSegments = buildMinuteSegments(record.entry, record.exit);
    let normalLeft = rules.JORNAL_SABADO_OBLIGATORIO*60;
    let e50=0,e100=0;
    for (const minute of workSegments) {
      if (normalLeft > 0) { normalLeft--; continue; }
      if (minute < 13*60) e50++; else e100++;
    }
    result.extra50 = e50;
    result.extra100 = e100;
    result.review = minutesReal < rules.JORNAL_SABADO_OBLIGATORIO*60 - rules.TOLERANCIA_MINUTOS;
    return result;
  }

  // Lunes a viernes.
  if (adjustment?.dayOffType === "full") {
    result.type = "franco";
    return result;
  }

  const target = adjustment?.dayOffType === "half" ? rules.JORNAL_MEDIO_FRANCO : rules.JORNAL_NORMAL;
  result.type = adjustment?.dayOffType === "half" ? "medio-franco" : "normal";

  if (minutesReal == null) {
    result.review = false;
    return result;
  }

  if (adjustment?.dayOffType === "half" && !rules.HORAS_EXTRAS_DESPUES_DE_MEDIO_FRANCO) {
    result.minutesComputed = Math.min(minutesReal, target*60);
    result.normalCompleted = minutesReal >= target*60 - rules.TOLERANCIA_MINUTOS;
    result.review = minutesReal < target*60 - rules.TOLERANCIA_MINUTOS;
    return result;
  }

  result.minutesComputed = Math.min(minutesReal, target*60);
  const excess = Math.max(0, minutesReal-target*60);
  result.extra50 = excess;
  result.normalCompleted = minutesReal >= target*60 - rules.TOLERANCIA_MINUTOS;
  result.review = minutesReal < target*60 - rules.TOLERANCIA_MINUTOS;
  return result;
}

function splitSaturday(entry, exit) {
  let before13=0, after13=0;
  for (const minute of buildMinuteSegments(entry, exit)) {
    if (minute < 13*60) before13++; else after13++;
  }
  return {before13,after13};
}

function buildMinuteSegments(entry, exit) {
  const a=minutesFromTime(entry), b=minutesFromTime(exit);
  if (a===null || b===null) return [];
  const total=b>=a?b-a:(1440-a)+b;
  const out=[];
  for(let i=0;i<total;i++) out.push((a+i)%1440);
  return out;
}

export function classifySaturdays(state, periodDate) {
  const {start,end}=billingPeriodFor(periodDate);
  const saturdayKeys = dateRange(start,end)
    .filter(d=>d.getDay()===6)
    .map(d=>d.toISOString().slice(0,10));

  const worked = saturdayKeys.filter(key => state.records[key]?.entry && state.records[key]?.exit);

  const scored = worked.map(key => {
    const d = new Date(key+"T00:00:00");
    const day = calculateDay(d,state.records[key],{saturdayClass:"voluntary"},null);
    return {
      key,
      extra50:day.extra50,
      extra100:day.extra100,
      score:moneyScore(day.extra50,day.extra100,true),
      hours:day.minutesReal
    };
  }).sort((a,b)=>a.score-b.score);

  // Los dos menos rentables quedan obligatorios. Los restantes voluntarios.
  // Con menos de dos sábados trabajados, todos los trabajados son obligatorios.
  const required = new Set(scored.slice(0, Math.min(CONFIG.SABADOS_OBLIGATORIOS, scored.length)).map(x=>x.key));
  const voluntary = new Set(scored.slice(CONFIG.SABADOS_OBLIGATORIOS).map(x=>x.key));

  for (const key of saturdayKeys) {
    if (!state.dayAdjustments[key]) state.dayAdjustments[key]={};
    if (required.has(key)) state.dayAdjustments[key].saturdayClass="required";
    else if (voluntary.has(key)) state.dayAdjustments[key].saturdayClass="voluntary";
    else delete state.dayAdjustments[key].saturdayClass;
  }
  return {worked, scored, required, voluntary};
}

export function calculatePeriod(state, periodDate) {
  const {start,end}=billingPeriodFor(periodDate);
  const classification=classifySaturdays(state,periodDate);
  const days=dateRange(start,end);
  const result={
    start,end, classification, normalCompleted:0, realMinutes:0, computedMinutes:0,
    extra50:0,extra100:0,reviewDays:[],workedHolidays:0,unworkedHolidays:0,
    sundayWorked:0, saturdayRequired:0,saturdayVoluntary:0
  };

  for(const date of days){
    const key=date.toISOString().slice(0,10);
    const record=state.records[key]||{};
    const adjustment=state.dayAdjustments[key]||{};
    const holiday=state.holidays[key];
    const day=calculateDay(date,record,adjustment,holiday);
    result.realMinutes+=day.minutesReal;
    result.computedMinutes+=day.minutesComputed;
    result.extra50+=day.extra50;
    result.extra100+=day.extra100;
    if(day.normalCompleted) result.normalCompleted++;
    if(day.review) result.reviewDays.push(key);
    if(date.getDay()===0 && day.minutesReal>0) result.sundayWorked++;
    if(holiday && day.minutesReal>0) result.workedHolidays++;
    if(holiday && day.minutesReal===0) result.unworkedHolidays++;
    if(adjustment.saturdayClass==="required") result.saturdayRequired++;
    if(adjustment.saturdayClass==="voluntary") result.saturdayVoluntary++;
  }
  return result;
}
