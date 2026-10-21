const STORAGE_KEY = "mi-control-laboral-v1";

const EMPTY = {
  version: 1,
  records: {},
  dayAdjustments: {},
  holidays: {},
  holidayMeta: { lastUpdate: null, years: [] },
  dayOffCredits: [],
  halfDayCredits: [],
  debts: [],
  history: [],
  settings: {},
  preferences: {}
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return clone(EMPTY);
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch (error) {
    console.error("No se pudo leer el almacenamiento local:", error);
    return clone(EMPTY);
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("No se pudo guardar el almacenamiento local:", error);
    throw new Error("No se pudo guardar la información en el navegador.");
  }
}

export function normalizeState(state) {
  const result = { ...clone(EMPTY), ...(state || {}) };
  result.records = result.records && typeof result.records === "object" ? result.records : {};
  result.dayAdjustments = result.dayAdjustments && typeof result.dayAdjustments === "object" ? result.dayAdjustments : {};
  result.holidays = result.holidays && typeof result.holidays === "object" ? result.holidays : {};
  result.holidayMeta = result.holidayMeta || clone(EMPTY.holidayMeta);
  result.dayOffCredits = Array.isArray(result.dayOffCredits) ? result.dayOffCredits : [];
  result.halfDayCredits = Array.isArray(result.halfDayCredits) ? result.halfDayCredits : [];
  result.debts = Array.isArray(result.debts) ? result.debts : [];
  result.history = Array.isArray(result.history) ? result.history : [];
  result.settings = result.settings && typeof result.settings === "object" ? result.settings : {};
  return result;
}

export function exportState(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `control-laboral-respaldo-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importState(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || !parsed.version || !parsed.records) {
    throw new Error("El archivo no parece ser un respaldo válido.");
  }
  return normalizeState(parsed);
}

export function pushHistory(state, item) {
  state.history.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    at: new Date().toISOString(),
    ...item
  });
  if (state.history.length > 500) state.history.length = 500;
}

export function createId(prefix="id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
