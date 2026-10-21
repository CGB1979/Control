import { CONFIG } from "./config.js";

export async function loadHolidaysForYear(state,year) {
  const cachedYear=state.holidayMeta?.years?.includes(year);
  if(cachedYear) return {ok:true,fromCache:true};

  try {
    const response=await fetch(`${CONFIG.FERIADOS_API}/${year}`,{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!Array.isArray(data)) throw new Error("Formato de feriados inesperado.");

    for(const item of data){
      if(!item?.fecha) continue;
      state.holidays[item.fecha]={
        name:item.nombre||"Feriado",
        type:item.tipo||"",
        paidByCompany:false,
        companyConfirmed:false
      };
    }
    if(!state.holidayMeta) state.holidayMeta={lastUpdate:null,years:[]};
    state.holidayMeta.lastUpdate=new Date().toISOString();
    state.holidayMeta.years=Array.from(new Set([...(state.holidayMeta.years||[]),year]));
    return {ok:true,fromCache:false};
  } catch(error) {
    console.warn("No se pudieron actualizar feriados:",error);
    return {ok:false,error};
  }
}

export function getHoliday(state,key){ return state.holidays[key]||null; }
