import { CONFIG } from "./config.js";

export function minutesFromTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) return null;
  const [h, m] = value.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

export function timeFromMinutes(total) {
  const safe = Math.max(0, Math.round(total));
  const h = Math.floor(safe / 60) % 24;
  const m = safe % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}

export function roundMinutes(value, mode, step = CONFIG.REDONDEO_MINUTOS) {
  if (mode === "ninguno" || !step) return value;
  if (mode === "abajo") return Math.floor(value / step) * step;
  if (mode === "arriba") return Math.ceil(value / step) * step;
  return Math.round(value / step) * step;
}

export function referenceMinutes(realMinutes, type) {
  const mode = type === "entrada" ? CONFIG.REDONDEO_ENTRADA : CONFIG.REDONDEO_SALIDA;
  return roundMinutes(realMinutes, mode);
}

export function buildIntervals(record) {
  const punches = [...(record?.punches || [])].sort((a,b) => a.timestamp - b.timestamp);
  const intervals = [];
  let pendingIn = null;
  for (const punch of punches) {
    if (punch.type === "entrada") {
      if (pendingIn === null) pendingIn = punch;
      else {
        // Dos entradas seguidas: conserva la primera y registra la segunda como evento, sin inventar una salida.
      }
    } else if (punch.type === "salida" && pendingIn) {
      const start = minutesFromTime(pendingIn.time);
      const end = minutesFromTime(punch.time);
      if (start !== null && end !== null && end >= start) {
        intervals.push({ start, end, sourceIn: pendingIn, sourceOut: punch });
      }
      pendingIn = null;
    }
  }
  return intervals;
}

export function realWorkedMinutes(record) {
  return buildIntervals(record).reduce((sum, x) => sum + (x.end - x.start), 0);
}

export function effectiveReferenceMinutes(record) {
  const intervals = buildIntervals(record);
  return intervals.reduce((sum, x) => {
    const start = referenceMinutes(x.start, "entrada");
    const end = referenceMinutes(x.end, "salida");
    return sum + Math.max(0, end - start);
  }, 0);
}

export function isSunday(date) { return date.getDay() === 0; }
export function isSaturday(date) { return date.getDay() === 6; }
export function iso(date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
export const isoDate = iso;

export function classifySaturday(record) {
  return record?.saturdayType || null;
}

export function calculateDay(record, date, holiday, settings = {}) {
  const real = realWorkedMinutes(record);
  const reference = effectiveReferenceMinutes(record);
  const hasWork = real > 0;
  const sunday = isSunday(date);
  const saturday = isSaturday(date);
  const holidayWorked = !!holiday && hasWork;
  const feriadoExcesoGeneraFranco = settings.feriadoExcesoGeneraFranco ?? CONFIG.FERIADO_EXCESO_GENERA_FRANCO;

  let required = CONFIG.JORNAL_NORMAL_HORAS * 60;
  let counted = 0;
  let extra50 = 0;
  let extra100 = 0;
  let review = false;
  let leaveMode = record?.leaveMode || null;

  if (record?.leaveMode === "franco_entero") {
    counted = required;
  } else if (record?.leaveMode === "medio_franco") {
    required = CONFIG.JORNADA_MEDIO_FRANCO_HORAS * 60;
    counted = required;
    if (CONFIG.HORAS_EXTRAS_DESPUES_DE_MEDIO_FRANCO && reference > required) {
      // Regla deliberadamente preparada para activarse más adelante.
      extra50 = reference - required;
    }
  } else if (record?.leaveMode === "medio_franco_dia_completo") {
    counted = required;
  } else if (sunday || holidayWorked) {
    // DOMINGOS Y FERIADOS: toda la jornada efectivamente trabajada
    // se clasifica al 100 %. No se descuenta primero un jornal de 8 h.
    counted = required;
    extra100 = reference;
  } else if (saturday) {
    const type = record?.saturdayType || "provisional";
    if (type === "voluntario") {
      // Sábado voluntario: hasta 13:00 al 50 %, después al 100 %.
      const before13 = overlapMinutes(record, 0, 13 * 60);
      const after13 = Math.max(0, reference - before13);
      extra50 = before13;
      extra100 = after13;
      counted = reference;
    } else {
      // Sábado obligatorio: 8 h de jornal. El excedente se divide por 13:00.
      counted = Math.min(reference, CONFIG.JORNAL_SABADO_OBLIGATORIO * 60);
      const overtimeStart = distributeSaturdayOvertime(record, reference);
      extra50 = overtimeStart.before13;
      extra100 = overtimeStart.after13;
    }
  } else {
    counted = Math.min(reference, required);
    extra50 = Math.max(0, reference - required);
  }

  // Tolerancia: no castiga automáticamente una diferencia pequeña.
  if (!record?.leaveMode && required > 0 && reference < required) {
    const missing = required - reference;
    review = missing > CONFIG.TOLERANCIA_MINUTOS;
  }

  if (record?.needsReview) review = true;
  if (record?.lateDecision === "tarde" || record?.lateDecision === "cambio_turno") review = true;

  return {
    realMinutes: real,
    referenceMinutes: reference,
    requiredMinutes: required,
    countedMinutes: counted,
    extra50Minutes: extra50,
    extra100Minutes: extra100,
    review,
    worked: hasWork,
    sunday,
    saturday,
    holidayWorked,
    feriadoExcesoGeneraFranco,
    leaveMode,
    saturdayType: record?.saturdayType || null
  };
}

function overlapMinutes(record, startLimit, endLimit) {
  return buildIntervals(record).reduce((sum, interval) => {
    return sum + Math.max(0, Math.min(interval.end, endLimit) - Math.max(interval.start, startLimit));
  }, 0);
}

function distributeSaturdayOvertime(record, reference) {
  const required = CONFIG.JORNAL_SABADO_OBLIGATORIO * 60;
  const intervals = buildIntervals(record);
  let remaining = Math.max(0, reference - required);
  if (!remaining) return { before13: 0, after13: 0 };

  // Recorremos el tiempo trabajado después de completar las 8 horas.
  // Para no inventar una distribución cuando el turno cruza las 13:00,
  // usamos los minutos reales/referenciales por intervalo.
  let worked = 0;
  let before13 = 0;
  let after13 = 0;
  for (const interval of intervals) {
    const start = referenceMinutes(interval.start, "entrada");
    const end = referenceMinutes(interval.end, "salida");
    for (let minute = start; minute < end && worked < reference; minute++) {
      const isExtra = worked >= required;
      if (isExtra) {
        if (minute < 13 * 60) before13++;
        else after13++;
      }
      worked++;
    }
  }
  // Aplicar constantes para que realmente controlen la clasificación.
  if (!CONFIG.SABADO_OBLIGATORIO_ANTES_13_AL_50) {
    const swap = before13; before13 = 0; after13 += swap;
  }
  if (!CONFIG.SABADO_OBLIGATORIO_DESPUES_13_AL_100) {
    const swap = after13; after13 = 0; before13 += swap;
  }
  return { before13, after13 };
}

export function inferUsualEntry(state, date) {
  const previous = Object.entries(state.records)
    .filter(([key, record]) => key < iso(date) && record?.punches?.some(p => p.type === "entrada"))
    .sort(([a],[b]) => b.localeCompare(a))
    .slice(0, 30);

  const values = previous
    .map(([, record]) => record.punches.find(p => p.type === "entrada"))
    .filter(Boolean)
    .map(p => minutesFromTime(p.referenceTime || p.time))
    .filter(v => v !== null);

  if (values.length < CONFIG.MIN_REGISTROS_PARA_INFERIR_TURNO) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const middle = sorted[Math.floor(sorted.length / 2)];
  return middle;
}

export function suggestLateOrShift(state, date, entryTime) {
  const usual = inferUsualEntry(state, date);
  const actual = minutesFromTime(entryTime);
  if (usual === null || actual === null) return null;
  const difference = actual - usual;
  if (difference < CONFIG.DIFERENCIA_MINIMA_PARA_SUGERIR_TURNO) return null;
  return {
    usual,
    actual,
    difference,
    withinLateLimit: difference <= CONFIG.MAX_RETRASO_INFERIDO_MINUTOS
  };
}
