// CONFIGURACIÓN CENTRAL. Las reglas confirmadas quedan implementadas; las pendientes se pueden ajustar aquí.
export const CONFIG={
 jornalNormalHoras:8,jornalMedioFrancoHoras:4,toleranciaMinutos:5,
 margenLlegadaTardeMinutos:25,minimoMuestrasTurno:3,
 redondeoEntradaMinutos:0,redondeoSalidaMinutos:0,redondeoManualMinutos:0,
 // CONFIGURACIÓN DE SÁBADOS OBLIGATORIOS
 jornalSabadoObligatorio:8,
 sabadoObligatorioAntes13Al50:true,
 sabadoObligatorioDespues13Al100:true,
 sabadoVoluntarioAntes13Al50:true,sabadoVoluntarioDespues13Al100:true,
 // ///// ACA CAMBIAR SI SE HABILITAN LAS HORAS EXTRAS DESPUÉS DE UTILIZAR UN MEDIO FRANCO /////
 horasExtrasDespuesDeMedioFranco:false,
 compensacionAutomaticaDeudas:false,
 optimizacionSabadosActiva:true
};
