import { getDateKey, formatDateLong, getMonthLabel, isSameDay } from "./utils.js";

let lastTapAt = 0;
let lastTapKey = null;

export function renderCalendar({year, month, state, selectedDate, onSingleTap, onDoubleTap}) {
  const grid = document.getElementById("calendar-grid");
  const title = document.getElementById("calendar-title");
  title.textContent = getMonthLabel(year, month);

  grid.innerHTML = "";

  const first = new Date(year, month, 1);
  const firstMondayIndex = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const totalCells = Math.ceil((firstMondayIndex + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    const offset = i - firstMondayIndex;
    const date = new Date(year, month, offset + 1);
    const key = getDateKey(date);
    const inMonth = date.getMonth() === month;
    const weekday = date.getDay();
    const record = state.records[key];
    const adjustment = state.dayAdjustments[key] || {};
    const holiday = state.holidays[key];
    const day = document.createElement("button");
    day.type = "button";
    day.className = "cl-day";
    day.dataset.date = key;

    if (!inMonth) day.classList.add("is-other-month");
    if (isSameDay(date, new Date())) day.classList.add("is-today");
    if (selectedDate && key === getDateKey(selectedDate)) day.classList.add("is-selected");
    if (weekday === 0) day.classList.add("is-sunday");
    if (holiday) day.classList.add("is-holiday");
    if (adjustment.saturdayClass === "required") day.classList.add("is-required");
    if (adjustment.saturdayClass === "voluntary") day.classList.add("is-voluntary");
    if (adjustment.review) day.classList.add("is-review");

    const number = document.createElement("span");
    number.className = "cl-day-number";
    number.textContent = String(date.getDate());
    day.appendChild(number);

    if (adjustment.saturdayClass === "required") {
      day.appendChild(label("Sábado obligatorio"));
    } else if (adjustment.saturdayClass === "voluntary") {
      day.appendChild(label("Sábado voluntario"));
    } else if (holiday) {
      day.appendChild(label("Feriado"));
    } else if (weekday === 0) {
      day.appendChild(label("Domingo"));
    } else if (record?.entry || record?.exit) {
      day.appendChild(label("Registrado"));
    }

    if (record?.entry || record?.exit) {
      const hours = document.createElement("span");
      hours.className = "cl-day-hours";
      hours.textContent = shortHours(record);
      day.appendChild(hours);
    }

    const marker = document.createElement("i");
    marker.className = "cl-day-marker";
    if (adjustment.review) marker.classList.add("marker-review");
    else if (adjustment.saturdayClass === "required") marker.classList.add("marker-required");
    else if (adjustment.saturdayClass === "voluntary") marker.classList.add("marker-voluntary");
    else if (holiday || weekday === 0) marker.classList.add("marker-holiday");
    else if (record?.entry || record?.exit) marker.classList.add("marker-record");
    else marker.remove();
    if (marker.isConnected !== false) day.appendChild(marker);

    grid.appendChild(day);
  }

  // Un solo listener sobre el contenedor. Así un rerender del mes no
  // destruye el estado necesario para detectar el segundo toque.
  if (!grid.dataset.touchHandlerInstalled) {
    grid.addEventListener("pointerup", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      const cell = event.target.closest(".cl-day");
      if (!cell || !grid.contains(cell)) return;
      const key = cell.dataset.date;
      const now = performance.now();
      const delta = now - lastTapAt;
      event.preventDefault();

      if (key === lastTapKey && delta > 0 && delta < 380) {
        lastTapAt = 0;
        lastTapKey = null;
        onDoubleTap(parseDateKeyLocal(key));
      } else {
        lastTapAt = now;
        lastTapKey = key;
        onSingleTap(parseDateKeyLocal(key));
      }
    }, {passive:false});
    grid.dataset.touchHandlerInstalled = "true";
  }

  function parseDateKeyLocal(key) {
    const [y,m,d] = key.split("-").map(Number);
    return new Date(y,m-1,d);
  }
}

function label(text) {
  const span = document.createElement("span");
  span.className = "cl-day-label";
  span.textContent = text;
  return span;
}

function shortHours(record) {
  if (!record?.entry || !record?.exit) return "";
  const a = new Date(`1970-01-01T${record.entry}:00`);
  const b = new Date(`1970-01-01T${record.exit}:00`);
  let diff = (b-a)/3600000;
  if (diff < 0) diff += 24;
  return `${Math.floor(diff)}h${Math.round((diff%1)*60).toString().padStart(2,"0")}`;
}
