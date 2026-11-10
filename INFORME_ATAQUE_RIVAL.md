# Volley Scout — Etapa 2

Implementación local sobre la aplicación existente. No se publicó el sitio ni se actualizó la implementación remota de Google Apps Script.

## Funcionalidad

- Plantel rival parcial por partido: camiseta, puesto y nombre opcional; alta y edición durante el partido.
- Accesos ATAQUE RIVAL y TENDENCIAS RIVALES en la pantalla del partido. El panel rival conserva el marcador y el set; los controles propios siguen disponibles.
- Tres selecciones: atacante, dirección y resultado. La dirección se omite explícitamente y se limpia al iniciar otro ataque.
- Origen sugerido editable por puesto, destino y tipo opcionales y bloqueadores propios opcionales en Más detalles. No se deduce rotación rival.
- Ataques rivales dentro de la secuencia del rally existente. Punto rival, error y bloqueo propio utilizan el cierre actual; Sigue conserva el rally abierto.
- Un bloqueo propio ya pendiente se vincula al ataque rival sin generar otro punto ni otra participación estadística. Sin bloqueador identificado se cuenta el bloqueo colectivo y no se atribuye a un jugador propio.
- Deshacer usa los controles existentes: el punto deshecho recupera la secuencia pendiente; quitar la acción elimina su registro. Las estadísticas se calculan sobre rallies cerrados.
- Tendencias por equipo, set, jugador y origen: volumen, distribución, puntos, errores, continuidades y eficacia con el criterio vigente. Las direcciones desconocidas quedan fuera del denominador. Menos de diez ataques con dirección muestra Muestra reducida.

## Archivos

- Nuevos: `rival-attack.js`, `verify-rival-attack.cjs`, este informe.
- Modificados: `index.html`, `scout-v2.js`, `scout-v2.css`, `volley-engine.js`, `data-compat.js`, `stats-v2.js`, `sequence-stats.js`, `google-apps-script.gs`, `verify-all.cjs`.
- Resultado de pruebas actualizado: `RESULTADOS_PRUEBAS_ENTRENAMIENTO.json`.

No se modificaron PWA, service workers, planteles propios, sustituciones ni seguimiento de rotaciones.

## Validación ejecutada

El ejecutor `verify-all.cjs` incluye 17 suites: 314 comprobaciones aprobadas. De ellas, 27 casos agrupados corresponden al scouting rival y 61 a la Etapa 1.

Se ejecutaron pruebas de plantel parcial y edición; todas las direcciones y omisión; orígenes sugeridos y corrección zaguera; resultados terminales y continuidad; bloqueos identificados y sin identificar; vinculación con bloqueo propio existente; ataques alternados y múltiples ataques rivales; prevención de doble cierre; deshacer; tendencias propias y rivales; denominadores; filtros; persistencia, importación e históricos; exportación CSV y preparación local del contrato de Google Sheets.

## Integración remota pendiente

El archivo `google-apps-script.gs` actualizado acepta `rival_attack` en Volley Acciones y Volley Acciones V2, conserva sus metadatos y agrega Volley Atacantes Rivales cuando hay plantel rival. Los envíos antiguos conservan las pestañas anteriores.

La implementación remota de Apps Script debe actualizarse antes de sincronizar partidos que contengan ataques rivales. El servidor anterior no reconoce este fundamento y puede rechazar el envío; el guardado local se mantiene. No se ejecutaron escrituras contra Google Sheets real ni una publicación del sitio.

La validación visual en un celular o emulador de navegador queda pendiente; las pruebas automáticas anteriores no sustituyen esa revisión.
