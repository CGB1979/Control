# Mi Control Laboral — GitHub Pages

Webapp personal para registrar entradas/salidas, jornadas, horas extras, sábados, domingos, feriados y francos.

## Estructura

- `index.html`: estructura de la aplicación.
- `css/styles.css`: estilos aislados bajo `.cl-app`.
- `js/config.js`: reglas laborales configurables.
- `js/calendar.js`: calendario mensual normal.
- `js/marcaciones.js`: entradas, salidas y detección de referencia.
- `js/calculos.js`: cálculo de jornada y clasificación de sábados.
- `js/francos.js`: francos, medios francos y deudas.
- `js/feriados.js`: consulta y cache local de feriados.
- `js/storage.js`: LocalStorage, importación/exportación e historial.
- `js/ui.js`: modales, resumen e historial visual.
- `js/app.js`: coordinación general.
- `manifest.json` y `sw.js`: PWA cuando GitHub Pages sirve el proyecto por HTTPS.

## Regla del período de facturación

El calendario visual SIEMPRE es un mes calendario normal.

El período 25–24 solamente se utiliza para los cálculos y el resumen:
- 25 de octubre → 24 de noviembre
- 25 de noviembre → 24 de diciembre

## Sábados

Por cada período se buscan los sábados efectivamente trabajados.

- Si hay 1 o 2, los trabajados se consideran obligatorios.
- Si hay más de 2, se calculan todos como si fueran voluntarios para obtener una puntuación relativa.
- Los dos menos productivos quedan obligatorios.
- Los restantes quedan voluntarios.
- Un sábado voluntario genera un medio franco.
- La clasificación puede recalcularse desde Resumen.

La comparación económica es deliberadamente relativa porque el proyecto no recibió valores salariales monetarios. Se usa:
- 1 punto por hora al 50 %
- 2 puntos por hora al 100 %
- un pequeño desempate a favor del medio franco

Esto está centralizado en `moneyScore()` para poder reemplazarlo por una fórmula salarial real cuando se definan los importes.

## Feriados

La app consulta `https://api.argentinadatos.com/v1/feriados/{año}` y guarda localmente los resultados. La documentación de ArgentinaDatos indica que el endpoint devuelve `fecha`, `tipo` y `nombre`.

Si la red falla, se mantienen los feriados ya guardados.

## PWA

GitHub Pages proporciona HTTPS, por lo que `manifest.json` y `sw.js` quedan preparados para la instalación cuando el navegador/plataforma lo permita.

No se implementó sincronización remota. Los datos personales quedan en LocalStorage del navegador y se recomienda exportar respaldos JSON.

## GitHub Pages

Subí todo el contenido del repositorio y configurá Pages para publicar desde GitHub Actions. El workflow incluido en `.github/workflows/pages.yml` realiza el deploy.

## Limitaciones deliberadas

- El tratamiento monetario exacto de un sábado requiere valores salariales que no fueron definidos; por eso la optimización usa una escala relativa.
- La inferencia de llegada tarde es una sugerencia, nunca una confirmación automática.
- La compensación automática de deudas queda sin ejecutar automáticamente.
- El excedente de una jornada con medio franco está desactivado por defecto.


## Marcación y edición de fechas antiguas

- Un toque selecciona un día.
- Doble toque abre directamente **Editar día**.
- En Editar día se pueden cargar por separado **Entrada** y **Salida** con hora manual, aunque la fecha sea antigua.
- También se puede completar rápidamente cada hora con la hora actual mediante los botones “Ahora → entrada/salida”.
- Las modificaciones quedan registradas en el historial.

### Corrección v2
- La edición de día tiene un botón **Guardar cambios** visible y fijo al pie del modal en teléfonos.
- Se corrigió una declaración JavaScript duplicada que podía impedir que la aplicación cargara correctamente.

### Corrección v3
- El editor abierto con doble toque ahora incluye **USAR FRANCO** y **MEDIO FRANCO**.
- Ambos botones ejecutan las mismas acciones reales que el modal de jornada.
