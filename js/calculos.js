import {CONFIG} from "./config.js";
export const minHora=h=>h&&/^\d{2}:\d{2}$/.test(h)?(+h.slice(0,2)*60)+(+h.slice(3)):null;
export const horaMin=m=>{if(m==null)return"";m=((Math.round(m)%1440)+1440)%1440;return `${String(Math.floor(m/60)).padStart(2,"0")}:${String(m%60).padStart(2,"0")}`};
export function redondearHora(h,b){const m=minHora(h);return m==null||!b?h:horaMin(Math.round(m/b)*b)}
export function duracionTrabajada(e,s){const a=minHora(e),b=minHora(s);if(a==null||b==null)return 0;return b>=a?b-a:1440-a+b}
export const formatearHoras=m=>{m=Math.max(0,Math.round(m||0));return `${Math.floor(m/60)} h ${String(m%60).padStart(2,"0")} min`};
function franja(e,s,a,b){const x=minHora(e),y=minHora(s);if(x==null||y==null||y<=x)return 0;return Math.max(0,Math.min(y,b)-Math.max(x,a))}
export function calcularDia(d){const f=new Date(`${d.fecha}T12:00:00`),sem=f.getDay(),real=duracionTrabajada(d.entrada?.real,d.salida?.real),medio=d.medioFrancoAplicado===true,jornalObjetivo=(medio?CONFIG.jornalMedioFrancoHoras:CONFIG.jornalNormalHoras)*60;let jornal=0,extra50=0,extra100=0,revision=false,motivo=[];
 if(d.francoAplicado)return{minutosReales:real,minutosJornal:0,extra50:0,extra100:0,revision:false,motivo:[],estado:"Franco aplicado"};
 if(d.feriadoNoTrabajo&&!real)return{minutosReales:0,minutosJornal:0,extra50:0,extra100:0,revision:false,motivo:[],estado:"No trabajado por feriado"};
 if(!real)return{minutosReales:0,minutosJornal:0,extra50:0,extra100:0,revision:false,motivo:[],estado:"Sin marcaciones"};
 if(sem===0){extra100=real}
 else if(sem===6){if(d.clasificacionSabado==="voluntario"){extra50=CONFIG.sabadoVoluntarioAntes13Al50?franja(d.entrada?.real,d.salida?.real,0,780):0;extra100=CONFIG.sabadoVoluntarioDespues13Al100?franja(d.entrada?.real,d.salida?.real,780,1440):0;jornal=real}else{jornal=Math.min(real,CONFIG.jornalSabadoObligatorio*60);let ex=Math.max(0,real-jornal),fin=minHora(d.salida?.real),inicio=(minHora(d.entrada?.real)||0)+jornal,a=Math.max(0,Math.min(fin||0,780)-inicio),b=Math.max(0,(fin||0)-Math.max(780,inicio));extra50=CONFIG.sabadoObligatorioAntes13Al50?a:0;extra100=CONFIG.sabadoObligatorioDespues13Al100?b:0;if(extra50+extra100<ex){if(CONFIG.sabadoObligatorioAntes13Al50)extra50+=ex-extra50-extra100;else extra100+=ex-extra50-extra100}}}
 else if(d.esFeriado){extra100=real}
 else{jornal=Math.min(real,jornalObjetivo);extra50=Math.max(0,real-jornal);if(real<jornalObjetivo){revision=true;motivo.push(real+CONFIG.toleranciaMinutos>=jornalObjetivo?"Diferencia pequeña respecto del jornal: revisar.":`Faltan ${formatearHoras(jornalObjetivo-real)} para el jornal.`)}}
 if(medio){jornal=Math.min(real,CONFIG.jornalMedioFrancoHoras*60);if(real<jornalObjetivo){revision=true;motivo.push("La jornada con medio franco tiene menos de 4 horas.")}if(!CONFIG.horasExtrasDespuesDeMedioFranco)extra50=extra100=0}
 return{minutosReales:real,minutosJornal:jornal,extra50,extra100,revision,motivo,estado:revision?"Revisión":"Jornada calculada"}}
