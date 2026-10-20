# Control Laboral

Webapp PWA estática para GitHub Pages. No requiere Node, React, Bootstrap ni servidor propio.

## Estructura
- `index.html`: estructura de la interfaz.
- `css/styles.css`: todos los estilos.
- `js/app.js`: coordinación de la aplicación e interfaz.
- `js/calendar.js`: calendario y toque/doble toque.
- `js/marcaciones.js`: entradas, salidas, correcciones y detección de turno.
- `js/calculos.js`: separación de horas reales, jornal y extras.
- `js/francos.js`: francos, medios francos y deudas.
- `js/feriados.js`: consulta de feriados argentinos.
- `js/storage.js`: localStorage + IndexedDB + respaldos JSON.
- `js/config.js`: reglas configurables.
- `manifest.json`, `sw.js`, `assets/icon.svg`: PWA.
- `.github/workflows/pages.yml`: publicación automática opcional.

## GitHub Pages
Subí todo el repositorio conservando las carpetas. En Settings → Pages podés usar GitHub Actions o publicar desde la rama `main`/root.

La instalación como app requiere HTTPS y soporte del navegador. GitHub Pages sirve por HTTPS.

## Datos
La app no inventa sincronización remota. Guarda localmente y permite exportar/importar JSON. El respaldo JSON es la protección importante ante el borrado de datos del navegador.

## Feriados
Se intenta consultar `https://api.argentinadatos.com/v1/feriados/{año}`. Si no responde, se conserva la información local.

## Reglas pendientes
La lógica exacta de redondeo, tolerancia, cambios de turno, compensación automática de deudas y extras posteriores al medio franco quedan configurables. Las reglas confirmadas están implementadas.
