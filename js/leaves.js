import { addAudit, saveState } from "./storage.js";

function newItem(type, date, source = "generado") {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    type,
    date,
    status: "disponible",
    source,
    createdAt: new Date().toISOString(),
    usedOn: null
  };
}

export function syncGeneratedForDay(state, dateKey, dayCalc) {
  if (!dayCalc.worked) return;

  if (dayCalc.sunday && !state.leaves.fullGenerated.some(x => x.date === dateKey)) {
    state.leaves.fullGenerated.push(newItem("franco", dateKey));
    addAudit(state, "franco_generado", { date: dateKey, reason: "domingo trabajado" });
  }

  if (dayCalc.saturday && dayCalc.worked && dayCalc.saturdayType === "voluntario" &&
      !state.leaves.halfGenerated.some(x => x.date === dateKey)) {
    state.leaves.halfGenerated.push(newItem("medio_franco", dateKey));
    addAudit(state, "medio_franco_generado", { date: dateKey, reason: "sábado voluntario trabajado" });
  }
}

function oldestAvailable(items) {
  return items
    .filter(x => x.status === "disponible")
    .sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null;
}

export function availableFull(state) {
  return state.leaves.fullGenerated.filter(x => x.status === "disponible");
}
export function availableHalf(state) {
  return state.leaves.halfGenerated.filter(x => x.status === "disponible");
}
export function debtFull(state) { return state.leaves.fullDebt.filter(x => x.status === "pendiente"); }
export function debtHalf(state) { return state.leaves.halfDebt.filter(x => x.status === "pendiente"); }

export function useFullLeave(state, dateKey) {
  const item = oldestAvailable(state.leaves.fullGenerated);
  if (item) {
    item.status = "usado";
    item.usedOn = dateKey;
    state.leaves.fullUsed.push({ ...item });
    addAudit(state, "franco_usado", { generatedDate: item.date, usedOn: dateKey });
    return { ok: true, source: "disponible" };
  }

  // Se permite pedir el franco adelantado: queda como deuda independiente.
  const debt = newItem("franco", dateKey, "adelantado");
  debt.status = "pendiente";
  state.leaves.fullDebt.push(debt);
  addAudit(state, "franco_adeudado", { date: dateKey, reason: "franco adelantado sin disponible" });
  return { ok: true, source: "adelantado" };
}

export function useHalfLeave(state, dateKey) {
  const item = oldestAvailable(state.leaves.halfGenerated);
  if (item) {
    item.status = "usado";
    item.usedOn = dateKey;
    state.leaves.halfUsed.push({ ...item });
    addAudit(state, "medio_franco_usado", { generatedDate: item.date, usedOn: dateKey });
    return { ok: true, source: "disponible" };
  }

  // También se permite pedir un medio franco adelantado.
  const debt = newItem("medio_franco", dateKey, "adelantado");
  debt.status = "pendiente";
  state.leaves.halfDebt.push(debt);
  addAudit(state, "medio_franco_adeudado", { date: dateKey, reason: "medio franco adelantado sin disponible" });
  return { ok: true, source: "adelantado" };
}

export function useThreeHalvesForFullDay(state, dateKey) {
  const available = availableHalf(state).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));

  // Regla específica confirmada: 3 medios adelantados no cubren un día.
  // Si hay 2 disponibles y falta solamente 1, sí se permite pedir ese tercero adelantado.
  if (available.length < 2) {
    return {
      ok: false,
      reason: "Se necesitan al menos 2 medios francos disponibles para cubrir un día entero con un tercero adelantado."
    };
  }

  const toUse = available.slice(0, 2);
  for (const item of toUse) {
    item.status = "usado";
    item.usedOn = dateKey;
    state.leaves.halfUsed.push({ ...item });
  }

  const third = available[2];
  if (third) {
    third.status = "usado";
    third.usedOn = dateKey;
    state.leaves.halfUsed.push({ ...third });
    addAudit(state, "tres_medios_usados", { date: dateKey, adelantado: false });
    return { ok: true, advanced: false };
  }

  const debt = newItem("medio_franco", dateKey, "adelantado_para_cubrir_dia");
  debt.status = "pendiente";
  state.leaves.halfDebt.push(debt);
  addAudit(state, "tres_medios_usados", { date: dateKey, adelantado: true });
  return { ok: true, advanced: true };
}

export function markDebtPaid(state, debtId, type) {
  const list = type === "franco" ? state.leaves.fullDebt : state.leaves.halfDebt;
  const item = list.find(x => x.id === debtId && x.status === "pendiente");
  if (!item) return false;
  item.status = "compensada";
  item.compensatedAt = new Date().toISOString();
  addAudit(state, "deuda_compensada", { type, debtId });
  return true;
}

export function leaveTotals(state) {
  return {
    fullGenerated: state.leaves.fullGenerated.length,
    fullUsed: state.leaves.fullUsed.length,
    fullAvailable: availableFull(state).length,
    halfGenerated: state.leaves.halfGenerated.length,
    halfUsed: state.leaves.halfUsed.length,
    halfAvailable: availableHalf(state).length,
    fullDebt: debtFull(state).length,
    halfDebt: debtHalf(state).length
  };
}

export function persistLeaves(state) { saveState(state); }
