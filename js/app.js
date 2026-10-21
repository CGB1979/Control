import { CONFIG, MESES } from "./config.js";
import { loadState, saveState, addAudit, exportState, importState } from "./storage.js";
import { isoDate, calculateDay, minutesFromTime, timeFromMinutes, suggestLateOrShift } from "./time.js";
import { getHolidays, updateExternalHolidays } from "./holidays.js";
import { renderCalendar, bindCalendar } from "./calendar.js";
import { renderSummary, calculateMonth, formatHours } from "./summary.js";
import { syncGeneratedForDay, useFullLeave, useHalfLeave, useThreeHalvesForFullDay, leaveTotals, availableFull, availableHalf, debtFull, debtHalf, markDebtPaid } from "./leaves.js";
import { openModal, closeModal, modalHead, escapeHtml, confirmAction } from "./ui.js";

const state = loadState();
const view = { screen: "calendar", year: new Date().getFullYear(), month: new Date().getMonth(), selected: isoDate(new Date()) };
const main = document.getElementById("cl-main");

function save() { saveState(state); }
function dateFromKey(key) { const [y,m,d] = key.split("-").map(Number); return new Date(y, m-1, d); }
function formatDate(key) { return dateFromKey(key).toLocaleDateString("es-AR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }); }
function currentTime() { return new Date().toTimeString().slice(0,5); }

function ensureSaturdayClassifications(year, month) {
  const days = new Date(year, month + 1, 0).getDate();
  const worked = [];
  for (let d = 1; d <= days; d++) {
    const date = new Date(year, month, d);
    if (date.getDay() !== 6) continue;
    const key = isoDate(date);
    const record = state.records[key];
    if (!record?.punches?.length) continue;
    worked.push({ key, record });
  }
  worked.sort((a,b) => a.key.localeCompare(b.key));
  let mandatoryCount = worked.filter(x => x.record.saturdayType === "mandatory").length;
  for (const item of worked) {
    if (item.record.saturdayType === "mandatory" || item.record.saturdayType === "voluntario") continue;
    item.record.saturdayType = mandatoryCount < CONFIG.CANTIDAD_SABADOS_OBLIGATORIOS ? "mandatory" : "voluntario";
    item.record.saturdayClassification = "provisional";
    mandatoryCount += item.record.saturdayType === "mandatory" ? 1 : 0;
  }
}

function render() {
  document.querySelectorAll(".cl-nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.screen === view.screen));
  document.getElementById("cl-screen-title").textContent = {
    calendar: "Calendario", summary: "Jornales y horas extras", leaves: "Francos", history: "Historial"
  }[view.screen] || "Calendario";

  if (view.screen === "calendar") renderCalendarScreen();
  if (view.screen === "summary") renderSummaryScreen();
  if (view.screen === "leaves") renderLeavesScreen();
  if (view.screen === "history") renderHistoryScreen();
}

function renderCalendarScreen() {
  ensureSaturdayClassifications(view.year, view.month);
  save();
  const calendar = renderCalendar(state, view);
  const holidays = getHolidays(state, view.year);
  const today = isoDate(new Date());
  const { totals } = calculateMonth(state, view.year, view.month);
  main.innerHTML = `${calendar}
    <section class="cl-card">
      <h3>Resumen del mes</h3>
      <div class="cl-grid-3">
        <div class="cl-stat"><div class="value">${totals.jornales}</div><div class="label">Jornales</div></div>
        <div class="cl-stat"><div class="value">${formatHours(totals.extra50)}</div><div class="label">Extras 50 %</div></div>
        <div class="cl-stat"><div class="value">${formatHours(totals.extra100)}</div><div class="label">Extras 100 %</div></div>
      </div>
    </section>
    <section class="cl-note">Hoy: ${today}. Última actualización de feriados: ${state.holidays.lastUpdate ? new Date(state.holidays.lastUpdate).toLocaleString("es-AR") : "lista integrada / sin actualización externa"}.</section>`;

  bindCalendar(main, view, openDayModal);
  main.querySelector("[data-calendar-prev]").addEventListener("click", () => changeMonth(-1));
  main.querySelector("[data-calendar-next]").addEventListener("click", () => changeMonth(1));
}

function changeMonth(delta) {
  view.month += delta;
  if (view.month < 0) { view.month = 11; view.year--; }
  if (view.month > 11) { view.month = 0; view.year++; }
  render();
}

function openDayModal(dateKey) {
  view.selected = dateKey;
  const date = dateFromKey(dateKey);
  const holiday = getHolidays(state, date.getFullYear())[dateKey];
  const record = state.records[dateKey] || { punches: [], saturdayType: null, leaveMode: null, lateDecision: null, needsReview: false };
  state.records[dateKey] = record;
  const calc = calculateDay(record, date, holiday);
  syncGeneratedForDay(state, dateKey, calc);
  save();

  const status = record.leaveMode ? "leave" : holiday && !calc.worked ? "holiday" : calc.review ? "review" : "normal";
  const statusText = record.leaveMode === "franco_entero" ? "Cubierto con franco entero" :
    record.leaveMode === "medio_franco_dia_completo" ? "Cubierto con 3 medios francos" :
    record.leaveMode === "medio_franco" ? "Jornada reducida con medio franco" :
    holiday ? (calc.worked ? "Domingo / feriado trabajado" : `Feriado: ${holiday.name}`) :
    record.saturdayType === "mandatory" ? "Sábado obligatorio" : record.saturdayType === "voluntario" ? "Sábado voluntario" : "Jornada normal";

  const punches = [...(record.punches || [])].sort((a,b) => a.timestamp - b.timestamp);
  const punchHtml = punches.length ? punches.map((p, i) => `
    <div class="cl-time-row">
      <div class="cl-time-icon ${p.type === "entrada" ? "in" : "out"}">${p.type === "entrada" ? "→" : "←"}</div>
      <div><div class="cl-time-main">${p.type === "entrada" ? "Entrada" : "Salida"}: ${escapeHtml(p.time)}</div><div class="cl-time-ref">Ref. cálculo: ${escapeHtml(p.referenceTime || p.time)} · ${p.source === "manual" ? "manual" : "real"}</div></div>
      <div class="cl-time-actions"><button type="button" data-edit-punch="${i}">✎</button></div>
    </div>`).join("") : `<div class="cl-note">Todavía no hay marcaciones.</div>`;

  openModal(`${modalHead(formatDate(dateKey), holiday ? holiday.name : "")}
    <div class="cl-status ${status}">${statusText}</div>
    <section class="cl-card" style="box-shadow:none;margin:0 0 10px;padding:12px">
      <div class="cl-row"><strong>Horarios registrados</strong><span class="cl-muted cl-small">Real: ${formatHours(calc.realMinutes)}</span></div>
      ${punchHtml}
      <div class="cl-grid-2" style="margin-top:10px"><div class="cl-stat"><div class="value">${formatHours(calc.countedMinutes)}</div><div class="label">Jornal computado</div></div><div class="cl-stat"><div class="value">${formatHours(calc.extra50Minutes + calc.extra100Minutes)}</div><div class="label">Horas extras</div></div></div>
    </section>
    <div class="cl-action-stack">
      <div class="cl-action-grid">
        <button class="cl-btn cl-btn-success" id="cl-register-in" type="button">Registrar entrada</button>
        <button class="cl-btn cl-btn-danger" id="cl-register-out" type="button">Registrar salida</button>
      </div>
      <div class="cl-action-grid">
        <button class="cl-btn cl-btn-outline" id="cl-use-full" type="button">Usar franco</button>
        <button class="cl-btn cl-btn-purple" id="cl-use-half" type="button">Medio franco</button>
      </div>
      ${date.getDay() === 6 ? `<div class="cl-action-grid"><button class="cl-btn cl-btn-secondary" id="cl-sat-mandatory">Sábado obligatorio</button><button class="cl-btn cl-btn-secondary" id="cl-sat-voluntary">Sábado voluntario</button></div>` : ""}
      ${holiday ? `<button class="cl-btn cl-btn-secondary cl-btn-full" id="cl-holiday-no-work">Registrar que no se trabajó por feriado</button>` : ""}
      <button class="cl-btn cl-btn-secondary cl-btn-full" id="cl-delete-day">Eliminar registro del día</button>
    </div>
    <div class="cl-note">Un toque en entrada/salida registra la hora actual. Si el botón ya tiene un registro, hacé triple toque para abrir la corrección. Las horas reales quedan conservadas por separado.</div>`);

  bindRegisterButton("cl-register-in", dateKey, "entrada", record);
  bindRegisterButton("cl-register-out", dateKey, "salida", record);
  document.getElementById("cl-use-full").addEventListener("click", () => useFullForDay(dateKey));
  document.getElementById("cl-use-half").addEventListener("click", () => openHalfOptions(dateKey));
  const satMandatory = document.getElementById("cl-sat-mandatory");
  const satVoluntary = document.getElementById("cl-sat-voluntary");
  if (satMandatory) satMandatory.addEventListener("click", () => { record.saturdayType = "mandatory"; record.saturdayClassification = "manual"; save(); closeModal(); openDayModal(dateKey); });
  if (satVoluntary) satVoluntary.addEventListener("click", () => { record.saturdayType = "voluntario"; record.saturdayClassification = "manual"; save(); closeModal(); openDayModal(dateKey); });
  const noWork = document.getElementById("cl-holiday-no-work");
  if (noWork) noWork.addEventListener("click", () => { record.holidayNoWork = true; save(); closeModal(); render(); });
  document.getElementById("cl-delete-day").addEventListener("click", () => {
    confirmAction("¿Eliminar todas las marcaciones y datos de prueba de este día? Esta acción está pensada para las pruebas actuales.", () => {
      delete state.records[dateKey];
      addAudit(state, "registro_dia_eliminado", { date: dateKey });
      save(); closeModal(); render();
    });
  });
  mainEditPunchHandlers(dateKey);
}

function mainEditPunchHandlers(dateKey) {
  document.querySelectorAll("[data-edit-punch]").forEach(btn => {
    btn.addEventListener("click", () => openCorrectionModal(dateKey, Number(btn.dataset.editPunch)));
  });
}

function bindRegisterButton(id, dateKey, type, record) {
  const button = document.getElementById(id);
  if (!button) return;
  const already = record.punches?.some(p => p.type === type);
  if (already) {
    button.classList.add("cl-btn-secondary");
    button.textContent = `✓ ${type === "entrada" ? "Entrada" : "Salida"} registrada`;
    button.setAttribute("aria-label", "Triple toque para corregir");
  }

  let taps = [];
  button.addEventListener("click", () => {
    const now = Date.now();
    taps = taps.filter(t => now - t < 800);
    taps.push(now);

    if (already) {
      if (taps.length >= 3) {
        taps = [];
        openCorrectionChoice(dateKey, type);
      }
      return;
    }

    // Un toque: abre una confirmación con la hora actual.
    // El registro se guarda recién al pulsar GUARDAR.
    if (taps.length === 1) {
      openAutomaticTimeModal(dateKey, type);
    }
  });
}

function openAutomaticTimeModal(dateKey, type) {
  const time = currentTime();
  openModal(`${modalHead(`Registrar ${type}`, "Hora actual del teléfono")}
    <div class="cl-card" style="text-align:center;box-shadow:none;margin:0;background:#f5f8fb">
      <div class="cl-muted cl-small">La hora actual es</div>
      <div style="font-size:34px;font-weight:850;margin-top:5px">${time}</div>
    </div>
    <div class="cl-modal-actions">
      <button class="cl-btn cl-btn-secondary" data-close-modal>Cancelar</button>
      <button class="cl-btn cl-btn-primary" id="cl-save-current">Guardar</button>
    </div>`);
  document.getElementById("cl-save-current").addEventListener("click", () => {
    savePunch(dateKey, type, time, "real");
  });
}

function savePunch(dateKey, type, time, source) {
  const record = state.records[dateKey] || { punches: [] };
  state.records[dateKey] = record;
  record.punches = record.punches || [];
  if (record.punches.some(p => p.type === type)) {
    closeModal();
    openDayModal(dateKey);
    return;
  }
  record.punches.push({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    type, time, referenceTime: time, source, timestamp: Date.now()
  });
  addAudit(state, "marcacion_registrada", { date: dateKey, type, time, source });
  save();
  closeModal();
  const suggestion = type === "entrada" ? suggestLateOrShift(state, dateFromKey(dateKey), time) : null;
  if (suggestion) openLateShiftModal(dateKey, suggestion);
  else openDayModal(dateKey);
}

function openCorrectionChoice(dateKey, type) {
  openModal(`${modalHead(`Corregir horario de ${type}` , "Triple toque detectado")}
    <p>Elegí cómo querés corregir esta marcación.</p>
    <div class="cl-action-stack">
      <button class="cl-btn cl-btn-outline cl-btn-full" id="cl-correct-now">Usar hora actual</button>
      <button class="cl-btn cl-btn-purple cl-btn-full" id="cl-correct-manual">Ingresar hora manualmente</button>
    </div>`);
  document.getElementById("cl-correct-now").addEventListener("click", () => applyCorrection(dateKey, type, currentTime(), "real"));
  document.getElementById("cl-correct-manual").addEventListener("click", () => openManualTimeModal(dateKey, type));
}

function openCorrectionModal(dateKey, index) {
  const record = state.records[dateKey];
  const punch = record?.punches?.[index];
  if (!punch) return;
  openCorrectionChoice(dateKey, punch.type);
}

function openManualTimeModal(dateKey, type) {
  openModal(`${modalHead(`Ingresar ${type} manualmente`)}
    <div class="cl-form-group"><label for="cl-manual-time">Hora</label><input id="cl-manual-time" class="cl-input" type="time" value="${escapeHtml(currentTime())}"></div>
    <div class="cl-modal-actions"><button class="cl-btn cl-btn-secondary" data-close-modal>Cancelar</button><button class="cl-btn cl-btn-primary" id="cl-save-time">Guardar</button></div>`);
  document.getElementById("cl-save-time").addEventListener("click", () => {
    const value = document.getElementById("cl-manual-time").value;
    if (minutesFromTime(value) === null) return alert("Ingresá una hora válida.");
    applyCorrection(dateKey, type, value, "manual");
  });
}

function applyCorrection(dateKey, type, time, source) {
  const record = state.records[dateKey];
  const target = record?.punches?.find(p => p.type === type);
  if (!target) return;
  const previous = { ...target };
  target.time = time;
  target.referenceTime = time;
  target.source = source;
  target.correctedAt = new Date().toISOString();
  addAudit(state, "marcacion_corregida", { date: dateKey, type, previous, current: target });
  save(); closeModal(); openDayModal(dateKey);
}

function openLateShiftModal(dateKey, suggestion) {
  openModal(`${modalHead("Revisar entrada")}
    <p>La entrada registrada es <strong>${timeFromMinutes(suggestion.actual)}</strong> y la referencia inferida es <strong>${timeFromMinutes(suggestion.usual)}</strong>.</p>
    <div class="cl-note cl-warning">Esto es solo una sospecha. Puede tratarse de una llegada tarde o de un cambio de turno.</div>
    <div class="cl-action-stack">
      <button class="cl-btn cl-btn-outline cl-btn-full" id="cl-late">Fue una llegada tarde</button>
      <button class="cl-btn cl-btn-purple cl-btn-full" id="cl-shift">Cambié de turno</button>
    </div>`);
  document.getElementById("cl-late").addEventListener("click", () => {
    state.records[dateKey].lateDecision = "tarde";
    state.records[dateKey].needsReview = true;
    save(); closeModal(); openDayModal(dateKey);
  });
  document.getElementById("cl-shift").addEventListener("click", () => openShiftModal(dateKey));
}

function openShiftModal(dateKey) {
  openModal(`${modalHead("Nuevo horario habitual")}
    <div class="cl-form-group"><label for="cl-shift-time">Nueva entrada habitual</label><input id="cl-shift-time" class="cl-input" type="time" value="08:00"></div>
    <div class="cl-modal-actions"><button class="cl-btn cl-btn-secondary" data-close-modal>Cancelar</button><button class="cl-btn cl-btn-primary" id="cl-save-shift">Guardar</button></div>`);
  document.getElementById("cl-save-shift").addEventListener("click", () => {
    const value = document.getElementById("cl-shift-time").value;
    if (minutesFromTime(value) === null) return alert("Ingresá una hora válida.");
    state.records[dateKey].lateDecision = "cambio_turno";
    state.records[dateKey].provisionalShift = value;
    addAudit(state, "cambio_turno", { date: dateKey, newReference: value });
    save(); closeModal(); openDayModal(dateKey);
  });
}

function openHalfOptions(dateKey) {
  const available = availableHalf(state).length;
  openModal(`${modalHead("Usar medio franco")}
    <p>¿Qué querés hacer?</p>
    <div class="cl-action-stack">
      <button class="cl-btn cl-btn-outline cl-btn-full" id="cl-one-half">Usar medio franco <span class="cl-muted">(${available} disponibles)</span></button>
      <button class="cl-btn cl-btn-success cl-btn-full" id="cl-three-halves">Cubrir el día <span class="cl-muted">(gasta 3 medios)</span></button>
    </div>
    <div class="cl-note">Para cubrir un día entero con medios francos se necesitan 3. Se permite adelantar solo el tercero si ya hay 2 disponibles. No se permiten 3 medios adelantados.</div>`);
  document.getElementById("cl-one-half").addEventListener("click", () => {
    state.records[dateKey] = state.records[dateKey] || { punches: [] };
    const result = useHalfLeave(state, dateKey);
    if (!result.ok) return alert(result.reason);
    state.records[dateKey].leaveMode = "medio_franco";
    save(); closeModal(); openDayModal(dateKey);
  });
  document.getElementById("cl-three-halves").addEventListener("click", () => {
    state.records[dateKey] = state.records[dateKey] || { punches: [] };
    const result = useThreeHalvesForFullDay(state, dateKey);
    if (!result.ok) return alert(result.reason);
    state.records[dateKey].leaveMode = "medio_franco_dia_completo";
    save(); closeModal(); openDayModal(dateKey);
  });
}

function useFullForDay(dateKey) {
  const result = useFullLeave(state, dateKey);
  if (!result.ok) return alert(result.reason);
  state.records[dateKey] = state.records[dateKey] || { punches: [] };
  state.records[dateKey].leaveMode = "franco_entero";
  save(); closeModal(); openDayModal(dateKey);
}

function renderSummaryScreen() { main.innerHTML = renderSummary(state); }

function renderLeavesScreen() {
  const totals = leaveTotals(state);
  main.innerHTML = `
    <section class="cl-card"><h2>Control acumulativo</h2><div class="cl-muted cl-small">Se actualiza cada vez que se genera, usa o adeuda un franco.</div></section>
    <section class="cl-card"><h3>Francos enteros</h3><div class="cl-grid-3"><div class="cl-stat"><div class="value">${totals.fullGenerated}</div><div class="label">Generados</div></div><div class="cl-stat"><div class="value">${totals.fullUsed}</div><div class="label">Usados</div></div><div class="cl-stat"><div class="value">${totals.fullAvailable}</div><div class="label">Disponibles</div></div></div><button class="cl-btn cl-btn-outline cl-btn-full" style="margin-top:10px" id="cl-list-full">Ver días generados</button></section>
    <section class="cl-card"><h3>Medios francos</h3><div class="cl-grid-3"><div class="cl-stat"><div class="value">${totals.halfGenerated}</div><div class="label">Generados</div></div><div class="cl-stat"><div class="value">${totals.halfUsed}</div><div class="label">Usados</div></div><div class="cl-stat"><div class="value">${totals.halfAvailable}</div><div class="label">Disponibles</div></div></div><button class="cl-btn cl-btn-outline cl-btn-full" style="margin-top:10px" id="cl-list-half">Ver días generados</button></section>
    <section class="cl-card"><h3>Adeudados</h3><div class="cl-grid-2"><div class="cl-stat"><div class="value">${totals.fullDebt}</div><div class="label">Francos adeudados</div></div><div class="cl-stat"><div class="value">${totals.halfDebt}</div><div class="label">Medios adeudados</div></div></div><div class="cl-action-grid" style="margin-top:10px"><button class="cl-btn cl-btn-outline" id="cl-list-debt-full">Ver francos</button><button class="cl-btn cl-btn-outline" id="cl-list-debt-half">Ver medios</button></div></section>`;

  document.getElementById("cl-list-full").addEventListener("click", () => openLeaveList("Francos generados", state.leaves.fullGenerated, "franco"));
  document.getElementById("cl-list-half").addEventListener("click", () => openLeaveList("Medios francos generados", state.leaves.halfGenerated, "medio_franco"));
  document.getElementById("cl-list-debt-full").addEventListener("click", () => openLeaveList("Francos adeudados", state.leaves.fullDebt, "franco", true));
  document.getElementById("cl-list-debt-half").addEventListener("click", () => openLeaveList("Medios francos adeudados", state.leaves.halfDebt, "medio_franco", true));
}

function openLeaveList(title, items, type, debts = false) {
  const sorted = [...items].sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  openModal(`${modalHead(title)}
    <div class="cl-list">${sorted.length ? sorted.map(item => `<div class="cl-list-item"><span class="cl-list-dot"></span><div><div class="cl-list-title">${formatDate(item.date)}</div><div class="cl-list-meta">${debts ? "Pendiente / adelantado" : item.status === "usado" ? `Usado el ${item.usedOn}` : "Disponible"}</div></div><span>›</span></div>`).join("") : `<div class="cl-note">No hay registros.</div>`}</div>`);
}

function renderHistoryScreen() {
  const audit = state.audit.slice(0, 100);
  main.innerHTML = `<section class="cl-card"><h2>Historial</h2><div class="cl-muted cl-small">Cambios de horarios, registros y movimientos de francos.</div></section>
    <section class="cl-card"><div class="cl-list">${audit.length ? audit.map(x => `<div class="cl-list-item"><span class="cl-list-dot"></span><div><div class="cl-list-title">${escapeHtml(historyLabel(x.action))}</div><div class="cl-list-meta">${new Date(x.timestamp).toLocaleString("es-AR")} · ${escapeHtml(JSON.stringify(x.details))}</div></div></div>`).join("") : `<div class="cl-note">Todavía no hay movimientos.</div>`}</div></section>`;
}
function historyLabel(action) {
  return ({
    marcacion_registrada: "Registro de horario",
    marcacion_corregida: "Corrección de horario",
    registro_dia_eliminado: "Eliminación de registro",
    franco_generado: "Franco generado",
    franco_usado: "Franco usado",
    franco_adeudado: "Franco adelantado / adeudado",
    medio_franco_generado: "Medio franco generado",
    medio_franco_usado: "Medio franco usado",
    medio_franco_adeudado: "Medio franco adelantado / adeudado",
    tres_medios_usados: "Tres medios francos aplicados",
    cambio_turno: "Cambio de turno",
    deuda_compensada: "Deuda compensada"
  })[action] || action;
}

function renderSettings() {
  openModal(`${modalHead("Configuración")}
    <section class="cl-card" style="box-shadow:none;margin:0 0 10px"><h3>Reglas laborales</h3>
      <div class="cl-form-group"><label>Jornal normal</label><input class="cl-input" value="${CONFIG.JORNAL_NORMAL_HORAS}" disabled></div>
      <div class="cl-form-group"><label>Tolerancia (minutos)</label><input id="cl-setting-tolerance" class="cl-input" type="number" min="0" value="${CONFIG.TOLERANCIA_MINUTOS}"></div>
      <div class="cl-form-group"><label>Redondeo de entrada</label><select id="cl-setting-round-in" class="cl-input"><option value="ninguno">Sin redondeo</option><option value="abajo">Abajo</option><option value="arriba">Arriba</option><option value="cercano">Más cercano</option></select></div>
      <div class="cl-form-group"><label>Redondeo de salida</label><select id="cl-setting-round-out" class="cl-input"><option value="ninguno">Sin redondeo</option><option value="abajo">Abajo</option><option value="arriba">Arriba</option><option value="cercano">Más cercano</option></select></div>
    </section>
    <section class="cl-card" style="box-shadow:none;margin:0"><h3>Datos</h3>
      <button class="cl-btn cl-btn-outline cl-btn-full" id="cl-export">Exportar respaldo JSON</button>
      <label class="cl-btn cl-btn-secondary cl-btn-full" style="display:block;text-align:center;margin-top:8px;cursor:pointer">Importar respaldo <input id="cl-import" type="file" accept="application/json" hidden></label>
      <div class="cl-note cl-danger-note">El almacenamiento local no sincroniza automáticamente entre dispositivos. Borrar los datos del navegador puede provocar pérdida de información si no tenés un respaldo.</div>
    </section>`);

  const rIn = document.getElementById("cl-setting-round-in");
  const rOut = document.getElementById("cl-setting-round-out");
  rIn.value = CONFIG.REDONDEO_ENTRADA;
  rOut.value = CONFIG.REDONDEO_SALIDA;
  rIn.addEventListener("change", e => state.settings.roundIn = e.target.value);
  rOut.addEventListener("change", e => state.settings.roundOut = e.target.value);
  document.getElementById("cl-setting-tolerance").addEventListener("change", e => state.settings.tolerance = Number(e.target.value));
  document.getElementById("cl-export").addEventListener("click", () => exportState(state));
  document.getElementById("cl-import").addEventListener("change", async e => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const imported = await importState(file);
      if (!confirm("Esto reemplazará los datos actuales de esta app. ¿Continuar?")) return;
      Object.keys(state).forEach(k => delete state[k]);
      Object.assign(state, imported);
      save(); closeModal(); render();
    } catch (error) { alert(error.message); }
  });
}

document.querySelectorAll(".cl-nav-btn").forEach(btn => btn.addEventListener("click", () => { view.screen = btn.dataset.screen; render(); }));
document.getElementById("btn-settings").addEventListener("click", renderSettings);

// Intento real de actualización solo si se configuró una fuente externa.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js').catch(error => console.warn('PWA no disponible:', error));
}
updateExternalHolidays(state).then(result => { if (result.updated) { save(); if (view.screen === "calendar") render(); } });

render();
