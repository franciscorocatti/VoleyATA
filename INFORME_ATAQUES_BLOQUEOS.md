# Ataques, scouting rival y bloqueos — actualización

El trabajo se realizó directamente en `para_github_etapas_1_y_2_20261109`. La raíz anterior y la carpeta `para_github` no se actualizaron. No se publicó el sitio ni se modificó Google Sheets remoto.

## Cambios

- Se consulta el puesto existente del jugador y se conserva al crear partidos, guardar equipos y volver a cargarlos. Se reconocen los campos habituales `attackPosition`, `position`, `role`, `puesto` y `posicion`. Los puestos se pueden completar o corregir en el plantel; el ataque muestra el puesto conocido y deja su corrección en un apartado secundario.
- Se mantienen las zonas rápidas y la condición propia calculada por rotación. Una zona excepcional o una omisión explícita se guarda sin sustituirla por el valor predeterminado.
- Las sugerencias de bloqueo rival tienen una marca visual de sugerencia, separada de las camisetas confirmadas. Elegir solo un puesto no atribuye participaciones individuales. Las camisetas pueden confirmarse desde el plantel rival parcial o ingresarse manualmente. Cambiar el origen limpia las selecciones anteriores.
- Para un ataque propio delantero bloqueado, la identificación opcional y el cierre aparecen junto a los controles de ataque. El bloqueo a un zaguero puede cerrar directamente sin identificar. Se conservan los kills, puntos y cierres del use.
- Un atacante rival conserva su puesto cargado. Su condición se registra solo si fue observada; si se desconoce, condición y origen quedan sin registrar. Con condición conocida se ofrecen las zonas rápidas correspondientes. Las zonas de origen y destino siguen siendo opcionales.
- Bloqueo nuestro abre un panel dentro de la pantalla del partido. Sugiere camisetas propias entre los delanteros efectivos de la formación actual, priorizando lateral y central según el origen rival. Ninguna camiseta queda confirmada automáticamente. Se admiten selección individual, doble, triple y sin identificar.
- Punto de bloqueo cierra el rally existente una vez. Sigue / bloqueo cubierto conserva el rally abierto y cuenta un toque de bloqueo propio. Se reutiliza el cálculo existente y se vincula un bloqueo ya pendiente para evitar duplicaciones.
- Las tendencias agregan ataques delanteros/zagueros conocidos, condición desconocida, distribución por origen, bloqueos recibidos y use. Se conservan filtros, direcciones, tamaño de muestra y la eficacia con el criterio estadístico vigente.
- El tipo y el puesto del ataque propio se conservan también cuando el resultado es bloqueo recibido. Las sugerencias genéricas históricas sin identidad se muestran como bloqueo sin identificar en las estadísticas individuales, sin reescribir los datos guardados ni cambiar el total colectivo.

## Archivos de aplicación modificados

`attack-fast.js`, `saved-teams.js`, `index.html`, `scout-v2.js`, `scout-v21.js`, `blocker-tracking.js`, `rival-attack.js`, `volley-engine.js`, `data-compat.js`, `stats-v2.js`, `google-apps-script.gs`, `scout-v2.css`.

Las pruebas se incluyeron dentro de esta carpeta para ejecutarlas contra esta versión. Se agregó `verify-attack-blocks.cjs` y se ajustaron `verify-attack-fast.cjs`, `verify-rival-attack.cjs` y `verify-all.cjs`. El resultado completo está en `RESULTADOS_PRUEBAS_ENTRENAMIENTO.json`.

## Pruebas ejecutadas

Se ejecutaron las 18 suites de `verify-all.cjs`: **346 comprobaciones aprobadas**, incluidas 31 pruebas agrupadas de esta actualización.

Incluyen: reconocimiento y conservación de puestos; las zonas propias requeridas; condiciones rivales conocidas y desconocidas; direcciones y omisión; origen y destino opcionales; sugerencias por zona sin atribución automática; confirmación de camisetas; bloqueos propios individuales, dobles y triples; bloqueo cubierto con continuidad; vinculación con bloqueo previo; múltiples ataques propios y rivales en el mismo rally; prevención de doble cierre; Deshacer; tendencias y filtros; persistencia, importación y preparación del contrato de Sheets. También se ejecutaron las regresiones existentes de entrenamiento, rotación, estadísticas, exportación y guardado.

Se verificó que las referencias locales de `index.html` estén presentes. `pwa.js`, `sw.js`, `service-worker.js` y `manifest.webmanifest` se compararon con la versión anterior y permanecen sin cambios.

## Pendiente

- Revisión visual y táctil en un celular o emulador. Las pruebas automáticas no la sustituyen.
- Publicación del contenido de esta carpeta en GitHub.
- Actualizar la implementación existente de Google Apps Script con el archivo incluido antes de sincronizar ataques rivales y bloqueos cubiertos nuevos. Subir el archivo a GitHub no modifica el servidor de Google. La integración se probó localmente; no se hicieron escrituras en la hoja real.
- Validar la distribución a instalaciones PWA ya existentes: el service worker actual sirve los recursos desde su caché y no se modificó, respetando el límite solicitado. La actualización de ese mecanismo queda fuera de esta etapa. No borrar datos del navegador para forzar una actualización.
