import {feriadoDe} from "./feriados.js";
import {calcularDia} from "./calculos.js";

export const claveFecha=f=>`${f.getFullYear()}-${String(f.getMonth()+1).padStart(2,"0")}-${String(f.getDate()).padStart(2,"0")}`;

// El período laboral siempre va del día 25 al 24 del mes siguiente.
export function inicioCicloDeFecha(fecha){
  const f=new Date(fecha);
  return f.getDate()>=25
    ? new Date(f.getFullYear(),f.getMonth(),25,12)
    : new Date(f.getFullYear(),f.getMonth()-1,25,12);
}
export function finCicloDeFecha(fecha){
  const inicio=inicioCicloDeFecha(fecha);
  return new Date(inicio.getFullYear(),inicio.getMonth()+1,24,12);
}
export function diasDelCiclo(fechaVista){
  const inicio=inicioCicloDeFecha(fechaVista),fin=finCicloDeFecha(fechaVista),dias=[];
  for(let d=new Date(inicio);d<=fin;d.setDate(d.getDate()+1))dias.push(new Date(d));
  return {inicio,fin,dias};
}
export function tituloCiclo(fechaVista){
  const {inicio,fin}=diasDelCiclo(fechaVista);
  const fmt=new Intl.DateTimeFormat("es-AR",{day:"numeric",month:"long",year:"numeric"});
  return `${fmt.format(inicio)} — ${fmt.format(fin)}`;
}

export function renderCalendario({contenedor,fechaVista,datos,fechaSeleccionada,onSeleccionar,onDobleToque}){
  contenedor.innerHTML="";
  const {inicio,fin,dias}=diasDelCiclo(fechaVista),hoy=claveFecha(new Date());
  // El ciclo siempre se dibuja completo. La grilla se ajusta a 5 filas (35 celdas).
  const inicioSemana=(inicio.getDay()+6)%7;
  const celdas=Math.ceil((inicioSemana+dias.length)/7)*7;

  for(let i=0;i<celdas;i++){
    const f=i<inicioSemana
      ? new Date(inicio.getFullYear(),inicio.getMonth(),inicio.getDate()-(inicioSemana-i),12)
      : i-inicioSemana<dias.length
        ? new Date(dias[i-inicioSemana])
        : new Date(fin.getFullYear(),fin.getMonth(),fin.getDate()+(i-inicioSemana-dias.length+1),12);
    const key=claveFecha(f),d=datos.dias[key],fer=feriadoDe(datos,key),c=f.getDay(),calc=d?calcularDia(d):null;
    const b=document.createElement("button");
    b.type="button";b.className="cl-day";
    if(f<inicio||f>fin)b.classList.add("is-outside");
    if(key===fechaSeleccionada)b.classList.add("is-selected");
    if(key===hoy)b.classList.add("is-today");
    if(c===0)b.classList.add("is-sunday");
    if(c===6&&d?.clasificacionSabado==="obligatorio")b.classList.add("is-saturday-obligatory");
    if(c===6&&d?.clasificacionSabado==="voluntario")b.classList.add("is-saturday-voluntary");
    if(c===6&&d?.medioFrancoGenerado)b.classList.add("is-saturday-voluntary");
    if(calc?.revision)b.classList.add("is-review");
    if(fer)b.classList.add("is-holiday");
    b.dataset.fecha=key;
    b.innerHTML=`<span class="cl-day-number">${f.getDate()}</span>${f.getMonth()!==inicio.getMonth()&&f.getDate()===1?`<span class="cl-month-mark">${new Intl.DateTimeFormat("es-AR",{month:"short"}).format(f)}</span>`:""}${fer?`<span class="cl-day-label">${fer.nombre}</span>`:""}${d?.entrada?.real||d?.salida?.real?`<div class="cl-day-times">${d.entrada?.real||"—"} → ${d.salida?.real||"—"}</div>`:""}<div class="cl-day-badges">${d?.francoAplicado?'<span class="cl-mini-badge">FRANCO</span>':''}${d?.medioFrancoAplicado?'<span class="cl-mini-badge">½ FRANCO</span>':''}${d?.medioFrancoGenerado?'<span class="cl-mini-badge">+½</span>':''}${d?.francoGenerado?'<span class="cl-mini-badge">+FRANCO</span>':''}${calc?.extra50?'<span class="cl-mini-badge">50%</span>':''}${calc?.extra100?'<span class="cl-mini-badge">100%</span>':''}${calc?.revision?'<span class="cl-mini-badge">REVISAR</span>':''}</div>`;
    contenedor.appendChild(b);
  }

  // Pointer events permiten mouse, touch y stylus con la misma lógica.
  let ultimoToque=0,ultimaFecha="",timer=null;
  const dobleVentana=500;
  const procesarToque=e=>{
    const b=e.target.closest(".cl-day");
    if(!b||!contenedor.contains(b))return;
    if(e.pointerType==="mouse"&&e.button!==0)return;
    e.preventDefault();
    const key=b.dataset.fecha,ahora=Date.now();
    const esDoble=key===ultimaFecha&&(ahora-ultimoToque)<=dobleVentana;
    clearTimeout(timer);
    if(esDoble){
      ultimoToque=0;ultimaFecha="";
      onDobleToque(key);
      return;
    }
    ultimaFecha=key;ultimoToque=ahora;
    timer=setTimeout(()=>{
      if(ultimaFecha===key){onSeleccionar(key);ultimaFecha="";ultimoToque=0}
    },dobleVentana);
  };
  contenedor.onpointerup=procesarToque;
}
