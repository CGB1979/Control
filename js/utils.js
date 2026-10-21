export function pad(n){ return String(n).padStart(2,"0"); }

export function getDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

export function parseDateKey(key) {
  const [y,m,d] = key.split("-").map(Number);
  return new Date(y,m-1,d);
}

export function formatDateLong(date) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday:"long", day:"numeric", month:"long", year:"numeric"
  }).format(date);
}

export function getMonthLabel(year, month) {
  return new Intl.DateTimeFormat("es-AR", {month:"long", year:"numeric"})
    .format(new Date(year,month,1))
    .replace(/^./, c=>c.toUpperCase());
}

export function minutesFromTime(time) {
  if (!time) return null;
  const [h,m] = time.split(":").map(Number);
  return h*60+m;
}

export function timeFromMinutes(total) {
  total = ((total % 1440) + 1440) % 1440;
  return `${pad(Math.floor(total/60))}:${pad(total%60)}`;
}

export function durationMinutes(entry, exit) {
  const a=minutesFromTime(entry), b=minutesFromTime(exit);
  if (a===null || b===null) return null;
  return b >= a ? b-a : (1440-a)+b;
}

export function hoursMinutes(minutes) {
  if (minutes == null) return "—";
  return `${Math.floor(minutes/60)}h ${minutes%60}min`;
}

export function dateRange(start,end) {
  const out=[]; let d=new Date(start);
  while(d<=end){out.push(new Date(d));d.setDate(d.getDate()+1);}
  return out;
}

export function billingPeriodFor(date) {
  const d = new Date(date.getFullYear(),date.getMonth(),date.getDate());
  let start, end;
  if (d.getDate() >= 25) {
    start = new Date(d.getFullYear(),d.getMonth(),25);
    end = new Date(d.getFullYear(),d.getMonth()+1,24);
  } else {
    start = new Date(d.getFullYear(),d.getMonth()-1,25);
    end = new Date(d.getFullYear(),d.getMonth(),24);
  }
  return {start,end};
}

export function billingPeriodLabel(date) {
  const {start,end}=billingPeriodFor(date);
  return `${new Intl.DateTimeFormat("es-AR",{day:"numeric",month:"long"}).format(start)} → ${new Intl.DateTimeFormat("es-AR",{day:"numeric",month:"long",year:"numeric"}).format(end)}`;
}

export function isSameDay(a,b){ return getDateKey(a)===getDateKey(b); }

export function moneyScore(extra50, extra100, halfFranco=true) {
  // Sin valores salariales confirmados, usamos una escala relativa:
  // 1 punto por hora al 50%, 2 por hora al 100%.
  // El medio franco es un beneficio adicional, pero no se convierte
  // arbitrariamente a dinero. Esto deja la comparación transparente.
  return extra50 + extra100*2 + (halfFranco ? 0.01 : 0);
}

export function humanDate(key) { return formatDateLong(parseDateKey(key)); }

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}
