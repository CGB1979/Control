/* ==========================================================
   CONFIGURACIÓN LABORAL CENTRALIZADA
   Cambiá estas constantes si más adelante confirmás otra regla.
   ========================================================== */

export const CONFIG = {
  // Lunes a viernes.
  JORNAL_NORMAL: 8,

  // Jornada reducida cuando se aplica un medio franco.
  JORNAL_MEDIO_FRANCO: 4,

  // Se permiten exactamente dos sábados obligatorios por período 25-24.
  SABADOS_OBLIGATORIOS: 2,

  // ==========================================================
  // CONFIGURACIÓN DE SÁBADOS OBLIGATORIOS
  // ==========================================================
  JORNAL_SABADO_OBLIGATORIO: 8,

  // Antes de las 13:00:
  // true = extras al 50 %.
  // false = extras al 100 %.
  SABADO_OBLIGATORIO_ANTES_13_AL_50: true,

  // Después de las 13:00:
  // true = extras al 100 %.
  // false = extras al 50 %.
  SABADO_OBLIGATORIO_DESPUES_13_AL_100: true,

  // Sábado voluntario.
  SABADO_VOLUNTARIO_ANTES_13_AL_50: true,
  SABADO_VOLUNTARIO_DESPUES_13_AL_100: true,

  // ==========================================================
  // ///// ACA CAMBIAR SI SE HABILITAN LAS HORAS EXTRAS
  // ///// DESPUES DE UTILIZAR UN MEDIO FRANCO
  // ==========================================================
  // false = DESACTIVADO: no calcula extras por encima de 4 h.
  // true = ACTIVADO: deja clasificar el excedente según las reglas
  // que se definan para este caso.
  // ==========================================================
  HORAS_EXTRAS_DESPUES_DE_MEDIO_FRANCO: false,

  // Tolerancia: no descuenta automáticamente. Solo señala revisión.
  TOLERANCIA_MINUTOS: 5,

  // Ventana para sospechar llegada tarde respecto de la referencia habitual.
  MARGEN_LLEGADA_TARDE_MINUTOS: 25,

  // Redondeos: por defecto desactivados.
  REDONDEAR_ENTRADA: false,
  REDONDEAR_SALIDA: false,
  REDONDEAR_MANUAL: false,
  MINUTOS_REDONDEO: 5,

  // Hora usada para separar extras del sábado.
  CORTE_SABADO: "13:00",

  // Endpoint público consultado para feriados argentinos.
  FERIADOS_API: "https://api.argentinadatos.com/v1/feriados",

  // La app conserva feriados localmente si la API no responde.
  MAX_EDAD_CACHE_FERIADOS_DIAS: 30
};
