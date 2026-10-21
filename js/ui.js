import { formatDateLong, humanDate, hoursMinutes, billingPeriodLabel, getDateKey, escapeHtml } from "./utils.js";
import { calculateDay } from "./calculos.js";
import { getCreditCounts } from "./francos.js";
import { getShiftStatus } from "./marcaciones.js";
import { CONFIG } from "./config.js";

let toastTimer;

export function showToast(message) {
  const el=document.getElementById("toast");
  el.textContent=message;
  el.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove("is-visible"),2600);
}

export function openModal(id) { document.getElementById(id).classList.add("is-open"); document.getElementById(id).setAttribute("aria-hidden","false"); }
export function closeModal(id) { document.getElementById(id).classList.remove("is-open"); document.getElementById(id).setAttribute("aria-hidden","true"); }
export function closeAllModals(){document.querySelectorAll(".cl-modal.is-open").forEach(x=>closeModal(x.id));}

export function renderDayModal({date,state,onAction}) {
  const key=getDateKey(date);
  const record=state.records[key]||{};
  const adjustment=state.dayAdjustments[key]||{};
  const holiday=state.holidays[key];
  const result=calculateDay(date,record,adjustment,holiday,state);
  const shift=getShiftStatus(state,key);
  const counts=getCreditCounts(state);
  const content=document.getElementById("day-modal-content");

  const entryDisabled=!!record.entry;
  const exitDisabled=!!record.exit;

  content.innerHTML=`
    <h2 class="cl-modal-title">${formatDateLong(date)}</h2>
    <p class="cl-modal-subtitle">${holiday ? `Feriado: ${holiday.name}` : "Jornada laboral"}</p>

    <div class="cl-info-card">
      <div class="cl-info-title">Horarios registrados</div>
      <div class="cl-time-row"><span>◷ Entrada</span><strong>${record.entry||"—"}</strong></div>
      <div class="cl-time-row"><span>◷ Salida</span><strong>${record.exit||"—"}</strong></div>
      ${record.updatedAt ? `<div class="cl-note">Última modificación: ${new Date(record.updatedAt).toLocaleString("es-AR")}</div>`:""}
    </div>

    <div class="cl-info-card">
      <div class="cl-info-title">Estado de la jornada</div>
      <div class="cl-time-row"><span>Trabajadas</span><strong>${hoursMinutes(result.minutesReal)}</strong></div>
      <div class="cl-time-row"><span>Computadas</span><strong>${hoursMinutes(result.minutesComputed)}</strong></div>
      <div class="cl-time-row"><span>Extra 50 %</span><strong>${hoursMinutes(result.extra50)}</strong></div>
      <div class="cl-time-row"><span>Extra 100 %</span><strong>${hoursMinutes(result.extra100)}</strong></div>
      ${result.review ? `<div class="cl-badge badge-yellow">Requiere revisión</div>` : `<div class="cl-badge badge-green">Sin incidencia calculada</div>`}
      ${shift.status==="possible-late" ? `<div class="cl-note">Posible llegada tarde: referencia ${shift.reference}. La app no lo considera un hecho hasta que lo confirmes.</div>` : ""}
      ${shift.status==="possible-shift-or-late" ? `<div class="cl-note">La entrada difiere de la referencia habitual. Puede ser llegada tarde o cambio de turno.</div>` : ""}
    </div>

    ${date.getDay()===6 ? saturdayBlock(adjustment, result) : ""}
    ${date.getDay()===0 ? `<div class="cl-note">Domingo trabajado: las horas se computan al 100 % y generan un franco entero.</div>` : ""}
    ${holiday ? `<div class="cl-note">Feriado detectado. El tratamiento como feriado pago por la empresa requiere confirmación.</div>` : ""}

    <div class="cl-actions">
      <button class="cl-primary-btn" data-action="entry" ${entryDisabled?"disabled":""}>◷ Registrar entrada${entryDisabled?" (registrada)":""}</button>
      <button class="cl-danger-btn" data-action="exit" ${exitDisabled?"disabled":""}>◷ Registrar salida${exitDisabled?" (registrada)":""}</button>
      ${entryDisabled ? `<button class="cl-secondary-btn" data-action="unlock-entry">Desbloquear / corregir entrada</button>`:""}
      ${exitDisabled ? `<button class="cl-secondary-btn" data-action="unlock-exit">Desbloquear / corregir salida</button>`:""}
      <button class="cl-secondary-btn" data-action="halfday">MEDIO FRANCO</button>
      <button class="cl-secondary-btn" data-action="fullfranco">USAR FRANCO</button>
      <button class="cl-secondary-btn" data-action="holiday-no-work">Registrar no trabajado por feriado</button>
      <button class="cl-secondary-btn" data-action="edit-note">Agregar nota / situación</button>
    </div>

    <div class="cl-note">Disponibles: ${counts.fullAvailable} franco(s) entero(s) · ${counts.halfAvailable} medio(s) franco(s).</div>
  `;

  content.querySelectorAll("[data-action]").forEach(btn=>{
    btn.addEventListener("click",()=>onAction(btn.dataset.action,key));
  });
}

function saturdayBlock(adjustment,result){
  if(adjustment.saturdayClass==="required") return `<div class="cl-info-card"><span class="cl-badge badge-orange">Sábado obligatorio</span><div class="cl-note">Jornal: 8 h. Excedente antes de 13:00 al 50 % y después de 13:00 al 100 %.</div></div>`;
  if(adjustment.saturdayClass==="voluntary") return `<div class="cl-info-card"><span class="cl-badge badge-green">Sábado voluntario</span><div class="cl-note">Hasta 13:00 al 50 %, después de 13:00 al 100 %. Genera medio franco.</div></div>`;
  return `<div class="cl-info-card"><span class="cl-badge badge-yellow">Sábado pendiente de clasificación</span><div class="cl-note">Al cerrar el período, los dos sábados menos productivos serán obligatorios; los restantes, voluntarios.</div></div>`;
}

export function renderSummary(state,period) {
  document.getElementById("summary-period-label").textContent=billingPeriodLabel(period.start);
  const cards=[
    ["Jornales normales",period.normalCompleted,"accent-green"],
    ["Horas reales",hoursMinutes(period.realMinutes),""],
    ["Horas computadas",hoursMinutes(period.computedMinutes),""],
    ["Extras 50 %",hoursMinutes(period.extra50),""],
    ["Extras 100 %",hoursMinutes(period.extra100),"accent-red"],
    ["Revisión",period.reviewDays.length,"accent-orange"],
    ["Domingos trabajados",period.sundayWorked,"accent-purple"],
    ["Feriados trabajados",period.workedHolidays,"accent-red"]
  ];
  document.getElementById("summary-cards").innerHTML=cards.map(([a,b,c])=>`<div class="cl-stat ${c}"><strong>${b}</strong><span>${a}</span></div>`).join("");

  const sat=period.classification.scored;
  document.getElementById("summary-saturdays").innerHTML=sat.length?sat.map(x=>{
    const cls=period.classification.required.has(x.key)?"badge-orange":"badge-green";
    const label=period.classification.required.has(x.key)?"Obligatorio":"Voluntario";
    return `<div class="cl-row"><div><strong>${humanDate(x.key)}</strong><br><small>${hoursMinutes(x.hours)} · ${hoursMinutes(x.extra50)} al 50 % · ${hoursMinutes(x.extra100)} al 100 %</small></div><span class="cl-badge ${cls}">${label}</span></div>`;
  }).join(""):`<div class="cl-empty">No hay sábados trabajados en este período.</div>`;

  // Resumen del período 25 -> 24: no mezclar créditos de otros meses.
  const periodStartKey=getDateKey(period.start);
  const periodEndKey=getDateKey(period.end);
  const inPeriod=key=>key>=periodStartKey && key<=periodEndKey;
  const periodFullCredits=(state.dayOffCredits||[]).filter(x=>inPeriod(x.sourceDate));
  const periodHalfCredits=(state.halfDayCredits||[]).filter(x=>inPeriod(x.sourceDate));
  const fullUsed=periodFullCredits.filter(x=>x.status==="used").length;
  const fullAvailable=periodFullCredits.filter(x=>x.status==="available").length;
  const halfUsed=periodHalfCredits.filter(x=>x.status==="used").length;
  const halfAvailable=periodHalfCredits.filter(x=>x.status==="available").length;
  const debts=getCreditCounts(state).debts;

  document.getElementById("summary-days-off").innerHTML=`
    <div class="cl-row"><span>Francos enteros generados</span><strong>${periodFullCredits.length}</strong></div>
    <div class="cl-row"><span>Francos enteros usados</span><strong>${fullUsed}</strong></div>
    <div class="cl-row"><span>Francos enteros disponibles</span><strong>${fullAvailable}</strong></div>
    <div class="cl-row"><span>Medios francos generados</span><strong>${periodHalfCredits.length}</strong></div>
    <div class="cl-row"><span>Medios francos usados</span><strong>${halfUsed}</strong></div>
    <div class="cl-row"><span>Medios francos disponibles</span><strong>${halfAvailable}</strong></div>
    <div class="cl-row"><span>Deudas pendientes</span><strong>${debts}</strong></div>`;

  document.getElementById("summary-incidents").innerHTML=period.reviewDays.length
    ? period.reviewDays.map(k=>`<div class="cl-row"><span>${humanDate(k)}</span><span class="cl-badge badge-yellow">Revisar</span></div>`).join("")
    : `<div class="cl-empty">No hay jornadas pendientes de revisión.</div>`;
}

export function renderHistory(state) {
  const list=document.getElementById("history-list");
  if(!state.history.length){list.innerHTML=`<div class="cl-empty">Todavía no hay movimientos registrados.</div>`;return;}
  list.innerHTML=state.history.map(x=>`
    <article class="cl-history-item">
      <div class="cl-history-head"><span>${humanDate(x.date||new Date().toISOString().slice(0,10))}</span><small>${new Date(x.at).toLocaleString("es-AR")}</small></div>
      <div class="cl-history-body">${describeHistory(x)}</div>
    </article>`).join("");
}

function describeHistory(x){
  if(x.type==="time"||x.type==="manual-time") return `${x.field==="entry"?"Entrada":"Salida"}: ${x.oldValue||"—"} → ${x.newValue}.`;
  if(x.type==="clear-time") return `Se quitó ${x.field==="entry"?"la entrada":"la salida"} anterior (${x.oldValue||"—"}).`;
  if(x.type==="franco-used") return "Se utilizó un franco entero.";
  if(x.type==="medio-franco-used") return "Se utilizó un medio franco.";
  if(x.type==="three-half-used") return "Se utilizaron tres medios francos para cubrir un día entero.";
  if(x.type==="debt-created") return `Se registró una deuda autorizada (${x.debtKind==="full"?"día completo":"media jornada"}).`;
  return `Movimiento: ${x.type}.`;
}

export function fillSettings(state){
  const s=state.settings;
  document.getElementById("cfg-weekday-hours").value=s.JORNAL_NORMAL ?? CONFIG.JORNAL_NORMAL;
  document.getElementById("cfg-half-day-hours").value=s.JORNAL_MEDIO_FRANCO ?? CONFIG.JORNAL_MEDIO_FRANCO;
  document.getElementById("cfg-tolerance").value=s.TOLERANCIA_MINUTOS ?? CONFIG.TOLERANCIA_MINUTOS;
  document.getElementById("cfg-late-window").value=s.MARGEN_LLEGADA_TARDE_MINUTOS ?? CONFIG.MARGEN_LLEGADA_TARDE_MINUTOS;
  document.getElementById("cfg-saturday-cutoff").value=s.CORTE_SABADO ?? CONFIG.CORTE_SABADO;
  document.getElementById("cfg-overtime-half-day").value=String(s.HORAS_EXTRAS_DESPUES_DE_MEDIO_FRANCO ?? CONFIG.HORAS_EXTRAS_DESPUES_DE_MEDIO_FRANCO);
  document.getElementById("holiday-status").textContent=state.holidayMeta?.lastUpdate
    ? `Última actualización: ${new Date(state.holidayMeta.lastUpdate).toLocaleString("es-AR")}`
    : "Todavía no se actualizaron los feriados desde internet.";
}


/* ==========================================================
   EDICIÓN COMPLETA DEL DÍA
   Se abre con doble toque sobre una fecha. Permite cargar
   ENTRADA y SALIDA de forma independiente, incluso para
   fechas antiguas. No obliga a usar la hora actual.
   ========================================================== */
export function renderEditDayModal({date,state,onSave,onCancel,onAction}) {
  const key=getDateKey(date);
  const record=state.records[key]||{};
  const adjustment=state.dayAdjustments[key]||{};
  const holiday=state.holidays[key];
  const result=calculateDay(date,record,adjustment,holiday,state);

  const content=document.getElementById("edit-day-content");
  content.innerHTML=`
    <h2 class="cl-modal-title">Editar día</h2>
    <p class="cl-modal-subtitle">${formatDateLong(date)}</p>

    <div class="cl-info-card">
      <div class="cl-info-title">Horarios registrados</div>
      <div class="cl-time-row"><span>◷ Entrada actual</span><strong>${record.entry||"—"}</strong></div>
      <div class="cl-time-row"><span>◷ Salida actual</span><strong>${record.exit||"—"}</strong></div>
      <div class="cl-note">Acá podés cargar o corregir ambas horas manualmente. Es válido para una fecha vieja.</div>
    </div>

    <div class="cl-edit-grid">
      <label class="cl-field"><span>Entrada</span><input id="edit-entry" class="cl-time-input" type="time" step="60" value="${escapeHtml(record.entry||"")}"></label>
      <label class="cl-field"><span>Salida</span><input id="edit-exit" class="cl-time-input" type="time" step="60" value="${escapeHtml(record.exit||"")}"></label>
    </div>

    <div class="cl-quick-time-row">
      <button class="cl-secondary-btn" type="button" data-now="entry">Ahora → entrada</button>
      <button class="cl-secondary-btn" type="button" data-now="exit">Ahora → salida</button>
    </div>

    ${date.getDay()===6 ? `
      <label class="cl-field"><span>Clasificación del sábado</span>
        <select id="edit-saturday-type">
          <option value="">Automática</option>
          <option value="required" ${adjustment.saturdayClass==="required"?"selected":""}>Obligatorio</option>
          <option value="voluntary" ${adjustment.saturdayClass==="voluntary"?"selected":""}>Voluntario</option>
        </select>
      </label>` : ""}

    ${holiday ? `
      <div class="cl-info-box">Feriado detectado: ${escapeHtml(holiday.name||"Feriado")}</div>
      <label class="cl-field"><span>¿Se trabajó por feriado?</span>
        <select id="edit-holiday-recognized">
          <option value="false" ${adjustment.holidayRecognized===true?"":"selected"}>No confirmado</option>
          <option value="true" ${adjustment.holidayRecognized===true?"selected":""}>Sí, reconocido como feriado</option>
        </select>
      </label>` : ""}

    <label class="cl-field"><span>Nota</span><input id="edit-note" type="text" maxlength="200" value="${escapeHtml(adjustment.note||"")}" placeholder="Opcional"></label>

    <div class="cl-info-card">
      <div class="cl-info-title">Estado calculado</div>
      <div class="cl-time-row"><span>Horas reales</span><strong>${hoursMinutes(result.minutesReal)}</strong></div>
      <div class="cl-time-row"><span>Jornal computado</span><strong>${hoursMinutes(result.minutesComputed)}</strong></div>
      <div class="cl-time-row"><span>Extra 50 %</span><strong>${hoursMinutes(result.extra50)}</strong></div>
      <div class="cl-time-row"><span>Extra 100 %</span><strong>${hoursMinutes(result.extra100)}</strong></div>
    </div>

    <div class="cl-credit-actions">
      <div class="cl-info-title">Francos disponibles para este día</div>
      <div class="cl-credit-buttons">
        <button class="cl-secondary-btn" type="button" data-action="fullfranco">USAR FRANCO</button>
        <button class="cl-secondary-btn" type="button" data-action="halfday">MEDIO FRANCO</button>
      </div>
      <div class="cl-note">El franco entero se consume por FIFO. Para cubrir un día entero con medios francos se necesitan 3.</div>
    </div>

    <div class="cl-edit-actions">
      <button class="cl-primary-btn" id="save-edit-day" type="button">Guardar cambios</button>
      <button class="cl-secondary-btn" id="cancel-edit-day" type="button">Cancelar</button>
    </div>
  `;

  content.querySelectorAll("[data-now]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const now=new Intl.DateTimeFormat("es-AR",{hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
      document.getElementById(`edit-${btn.dataset.now}`).value=now;
    });
  });
  content.querySelectorAll("[data-action]").forEach(btn=>{
    btn.addEventListener("click",()=>onAction?.(btn.dataset.action,key));
  });
  document.getElementById("save-edit-day").addEventListener("click",()=>onSave(key));
  document.getElementById("cancel-edit-day").addEventListener("click",onCancel);
}
