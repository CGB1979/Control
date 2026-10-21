import { CONFIG } from "./config.js";
import { loadState, saveState, exportState, importState, pushHistory } from "./storage.js";
import { renderCalendar } from "./calendar.js";
import { calculatePeriod, classifySaturdays } from "./calculos.js";
import { registerCurrentTime, registerTime, clearTime } from "./marcaciones.js";
import { loadHolidaysForYear } from "./feriados.js";
import { syncGeneratedCredits, useFullCredit, useHalfCredit, useThreeHalfCredits, authorizeDebt } from "./francos.js";
import { renderDayModal, renderEditDayModal, renderSummary, renderHistory, fillSettings, showToast, openModal, closeAllModals } from "./ui.js";
import { getDateKey, parseDateKey, billingPeriodFor, billingPeriodLabel } from "./utils.js";

let state=loadState();
let viewDate=new Date();
let selectedDate=new Date();
let pendingTriple={key:null,type:null,count:0,last:0};

function persist(){ saveState(state); refresh(); }

function refresh(){
  const period=billingPeriodFor(selectedDate);
  document.getElementById("header-period").textContent=`Período: ${billingPeriodLabel(selectedDate)}`;
  renderCalendar({
    year:viewDate.getFullYear(),
    month:viewDate.getMonth(),
    state,
    selectedDate,
    onSingleTap:(date)=>{ selectedDate=date; renderCalendar({
      year:viewDate.getFullYear(),month:viewDate.getMonth(),state,selectedDate,
      onSingleTap:(d)=>{selectedDate=d;refreshCalendarOnly();},
      onDoubleTap:openDay
    }); },
    onDoubleTap:openDay
  });
  renderSummary(state,period);
  renderHistory(state);
  fillSettings(state);
}

function refreshCalendarOnly(){
  renderCalendar({
    year:viewDate.getFullYear(),month:viewDate.getMonth(),state,selectedDate,
    onSingleTap:(date)=>{selectedDate=date;refreshCalendarOnly();},
    onDoubleTap:openDay
  });
}

function openDay(date){
  selectedDate=date;
  openEditDay(date);
}

function openEditDay(date){
  selectedDate=date;
  renderEditDayModal({
    date,
    state,
    onSave:(key)=>saveEditedDay(key),
    onCancel:closeAllModals,
    onAction:handleDayAction
  });
  openModal("edit-day-modal");
}

function saveEditedDay(key){
  const entry=document.getElementById("edit-entry").value || null;
  const exit=document.getElementById("edit-exit").value || null;

  const valid=t=>!t || /^\d{2}:\d{2}$/.test(t);
  if(!valid(entry) || !valid(exit)){
    showToast("Ingresá horas válidas.");
    return;
  }

  try{
    if(entry) registerTime(state,key,"entry",entry,true);
    else if(state.records[key]?.entry) clearTime(state,key,"entry");

    if(exit) registerTime(state,key,"exit",exit,true);
    else if(state.records[key]?.exit) clearTime(state,key,"exit");

    const previous=state.dayAdjustments[key]||{};
    const next={...previous};

    if(parseDateKey(key).getDay()===6){
      const sat=document.getElementById("edit-saturday-type");
      if(sat){
        if(sat.value) next.saturdayClass=sat.value;
        else delete next.saturdayClass;
      }
    }

    const holidaySelect=document.getElementById("edit-holiday-recognized");
    if(holidaySelect) next.holidayRecognized=holidaySelect.value==="true";

    const note=document.getElementById("edit-note").value.trim();
    if(note) next.note=note; else delete next.note;

    state.dayAdjustments[key]=next;
    pushHistory(state,{type:"edit-day",date:key,entry,exit});
    syncGeneratedCredits(state);
    persist();
    closeAllModals();
    showToast("Día guardado correctamente.");
  }catch(error){
    showToast(error.message || "No se pudo guardar el día.");
  }
}

function handleDayAction(action,key){
  if(action==="entry"||action==="exit"){
    const alreadyRegistered=!!state.records[key]?.[action];
    const now=performance.now();

    // Si ya existe una marcación, el botón queda "bloqueado" funcionalmente:
    // no la pisa con otro toque. Tres toques rápidos abren corrección.
    if(alreadyRegistered){
      if(pendingTriple.key===key && pendingTriple.type===action && now-pendingTriple.last<900){
        pendingTriple.count++;
      } else {
        pendingTriple={key,type:action,count:1,last:now};
      }
      pendingTriple.last=now;
      if(pendingTriple.count>=3){
        pendingTriple={key,type:action,count:0,last:0};
        openCorrection(key,action);
      } else {
        showToast("Marcación ya registrada. Tres toques rápidos abren la corrección.");
      }
      return;
    }

    // Primera marcación: registra la hora real y después el botón queda
    // protegido contra pulsaciones accidentales.
    try {
      registerCurrentTime(state,key,action);
      syncGeneratedCredits(state);
      persist();
      openDay(parseDateKey(key));
      showToast(`${action==="entry"?"Entrada":"Salida"} registrada.`);
    }catch(e){showToast(e.message);}
    return;
  }

  if(action==="unlock-entry"||action==="unlock-exit"){
    const type=action==="unlock-entry"?"entry":"exit";
    openCorrection(key,type);
    return;
  }

  if(action==="halfday"){ openHalfday(key); return; }

  if(action==="fullfranco"){
    const result=useFullCredit(state,key);
    if(result.ok){persist();openDay(parseDateKey(key));showToast("Franco entero aplicado.");}
    else {
      const ask=confirm(`${result.reason}\n\n¿Querés registrar el día como deuda autorizada?`);
      if(ask){
        const debt=authorizeDebt(state,key,"full");
        if(debt.ok){persist();openDay(parseDateKey(key));showToast("Día registrado como deuda.");}
      }
    }
    return;
  }

  if(action==="holiday-no-work"){
    state.dayAdjustments[key]={...(state.dayAdjustments[key]||{}),holidayNoWork:true};
    pushHistory(state,{type:"holiday-no-work",date:key});
    persist();openDay(parseDateKey(key));showToast("Registrado como no trabajado por feriado.");
    return;
  }

  if(action==="edit-note"){
    const note=prompt("Nota para este día:",state.dayAdjustments[key]?.note||"");
    if(note!==null){
      state.dayAdjustments[key]={...(state.dayAdjustments[key]||{}),note};
      pushHistory(state,{type:"note",date:key});
      persist();openDay(parseDateKey(key));
    }
  }
}

function openCorrection(key,type){
  const box=document.getElementById("correction-content");
  box.innerHTML=`
    <h2 class="cl-modal-title">Corregir hora de ${type==="entry"?"entrada":"salida"}</h2>
    <p class="cl-modal-subtitle">La marcación anterior se conserva en el historial.</p>
    <button class="cl-choice" data-correct="now">Usar hora actual<small>Registra la hora del teléfono ahora.</small></button>
    <button class="cl-choice" data-correct="manual">Ingresar hora manualmente<small>Permite elegir una hora exacta.</small></button>
  `;
  box.querySelector("[data-correct=now]").onclick=()=>{
    registerCurrentTime(state,key,type);persist();closeAllModals();openDay(parseDateKey(key));showToast("Hora corregida con la hora actual.");
  };
  box.querySelector("[data-correct=manual]").onclick=()=>openManualTime(key,type);
  openModal("correction-modal");
}

function openManualTime(key,type){
  const box=document.getElementById("manual-time-content");
  box.innerHTML=`
    <h2 class="cl-modal-title">Ingresar hora manualmente</h2>
    <p class="cl-modal-subtitle">${type==="entry"?"Entrada":"Salida"} del ${key}</p>
    <label class="cl-field"><span>Hora</span><input id="manual-time-input" class="cl-time-input" type="time" value="${state.records[key]?.[type]||""}"></label>
    <button class="cl-primary-btn" id="save-manual-time">Guardar</button>
  `;
  box.querySelector("#save-manual-time").onclick=()=>{
    const value=box.querySelector("#manual-time-input").value;
    try{
      registerTime(state,key,type,value,true);persist();closeAllModals();openDay(parseDateKey(key));showToast("Hora manual guardada.");
    }catch(e){showToast(e.message);}
  };
  openModal("manual-time-modal");
}

function openHalfday(key){
  const box=document.getElementById("halfday-content");
  box.innerHTML=`
    <h2 class="cl-modal-title">Medio franco</h2>
    <p class="cl-modal-subtitle">Tres medios francos equivalen a un día completo. Dos no alcanzan.</p>
    <button class="cl-choice" id="apply-half">Aplicar un medio franco<small>Consume el medio franco disponible más antiguo y deja jornada de 4 horas.</small></button>
    <button class="cl-choice" id="cover-full">Cubrir día entero<small>Consume tres medios francos disponibles, de los más antiguos.</small></button>
    <button class="cl-choice" id="authorize-half">Registrar jornada reducida autorizada como deuda<small>No consume un medio franco disponible.</small></button>
  `;
  box.querySelector("#apply-half").onclick=()=>{
    const result=useHalfCredit(state,key);
    if(result.ok){persist();closeAllModals();openDay(parseDateKey(key));showToast("Medio franco aplicado.");}
    else showToast(result.reason);
  };
  box.querySelector("#cover-full").onclick=()=>{
    const result=useThreeHalfCredits(state,key);
    if(result.ok){persist();closeAllModals();openDay(parseDateKey(key));showToast("Día cubierto con tres medios francos.");}
    else showToast(result.reason);
  };
  box.querySelector("#authorize-half").onclick=()=>{
    const result=authorizeDebt(state,key,"half");
    if(result.ok){persist();closeAllModals();openDay(parseDateKey(key));showToast("Media jornada registrada como deuda.");}
    else showToast(result.reason);
  };
  openModal("halfday-modal");
}

function goMonth(delta){
  viewDate=new Date(viewDate.getFullYear(),viewDate.getMonth()+delta,1);
  refresh();
}
function goToday(){viewDate=new Date();selectedDate=new Date();refresh();}

function initEvents(){
  document.getElementById("btn-prev-month").onclick=()=>goMonth(-1);
  document.getElementById("btn-next-month").onclick=()=>goMonth(1);
  document.getElementById("btn-today").onclick=goToday;
  document.getElementById("btn-recalculate").onclick=()=>{classifySaturdays(state,selectedDate);syncGeneratedCredits(state);persist();showToast("Período recalculado.");};

  document.querySelectorAll("[data-close-modal]").forEach(el=>el.addEventListener("click",closeAllModals));

  document.querySelectorAll(".cl-tab").forEach(tab=>{
    tab.onclick=()=>{
      document.querySelectorAll(".cl-tab").forEach(x=>x.classList.remove("is-active"));
      document.querySelectorAll(".cl-view").forEach(x=>x.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.getElementById(`view-${tab.dataset.view}`).classList.add("is-active");
      if(tab.dataset.view==="summary"){renderSummary(state, billingPeriodFor(selectedDate));}
      if(tab.dataset.view==="history"){renderHistory(state);}
      if(tab.dataset.view==="settings"){fillSettings(state);}
    };
  });

  document.getElementById("btn-settings").onclick=()=>document.querySelector('[data-view="settings"]').click();

  document.getElementById("btn-save-settings").onclick=()=>{
    state.settings={
      JORNAL_NORMAL:Number(document.getElementById("cfg-weekday-hours").value)||CONFIG.JORNAL_NORMAL,
      JORNAL_MEDIO_FRANCO:Number(document.getElementById("cfg-half-day-hours").value)||CONFIG.JORNAL_MEDIO_FRANCO,
      TOLERANCIA_MINUTOS:Number(document.getElementById("cfg-tolerance").value)||0,
      MARGEN_LLEGADA_TARDE_MINUTOS:Number(document.getElementById("cfg-late-window").value)||CONFIG.MARGEN_LLEGADA_TARDE_MINUTOS,
      CORTE_SABADO:document.getElementById("cfg-saturday-cutoff").value||CONFIG.CORTE_SABADO,
      HORAS_EXTRAS_DESPUES_DE_MEDIO_FRANCO:document.getElementById("cfg-overtime-half-day").value==="true"
    };
    persist();showToast("Configuración guardada.");
  };

  document.getElementById("btn-refresh-holidays").onclick=async()=>{
    const years=[viewDate.getFullYear(),viewDate.getFullYear()+1,viewDate.getFullYear()-1];
    let ok=0;
    for(const y of years){const r=await loadHolidaysForYear(state,y);if(r.ok)ok++;}
    persist();showToast(ok?`Feriados actualizados (${ok} año(s)).`:"No se pudo actualizar; se conservan los datos locales.");
  };

  document.getElementById("btn-export").onclick=()=>exportState(state);
  document.getElementById("file-import").onchange=async(e)=>{
    const file=e.target.files[0]; if(!file)return;
    if(!confirm("La importación reemplazará los datos actuales. ¿Continuar?"))return;
    try{state=await importState(file);saveState(state);refresh();showToast("Respaldo importado.");}
    catch(err){showToast("No se pudo importar el respaldo.");}
    e.target.value="";
  };
  document.getElementById("btn-clear-data").onclick=()=>{
    if(!confirm("Esto borrará todos los registros locales. ¿Continuar?"))return;
    localStorage.clear(); location.reload();
  };
}

async function boot(){
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(error => {
      console.warn("PWA: no se pudo registrar el service worker.", error);
    });
  }
  initEvents();
  syncGeneratedCredits(state);
  const years=[new Date().getFullYear(),new Date().getFullYear()+1];
  for(const y of years) await loadHolidaysForYear(state,y);
  saveState(state);
  refresh();
}

boot();
