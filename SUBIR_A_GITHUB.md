# Archivos para subir a GitHub — Etapas 1 y 2

Esta carpeta contiene la versión completa de Volley Scout, con entrenamientos y las dos etapas de ataque.

1. Subí TODO EL CONTENIDO de esta carpeta a la carpeta del repositorio que publica el sitio y contiene el index.html actual. No subas esta carpeta como una subcarpeta del sitio.
2. Reemplazá los archivos de igual nombre y agregá los nuevos. No es necesario borrar primero el repositorio.
3. Incluí attack-fast.js y rival-attack.js: son necesarios para que abra la nueva versión.

## Google Sheets

También se incluye google-apps-script.gs. Subirlo a GitHub no actualiza el servidor de Google: hay que reemplazar el código de la implementación existente de Apps Script y actualizar esa implementación conservando la URL configurada en la aplicación. El servidor anterior no acepta el nuevo fundamento rival_attack.

## Validación

Se ejecutaron 18 suites, con 346 comprobaciones aprobadas. La revisión visual en celular y la sincronización contra Google Sheets real siguen pendientes. No se publicó el sitio desde esta tarea.

INFORME_ATAQUES_BLOQUEOS.md contiene el detalle de la actualización actual; INFORME_ATAQUE_RIVAL.md corresponde a la entrega anterior. Los archivos .cjs son pruebas reproducibles de esta versión. No se incluyeron respaldos, datos de partidos ni carpetas de desarrollo.

La PWA y los service workers no se modificaron. La distribución a instalaciones que ya tienen la versión anterior en caché requiere validación al publicar; no borres los datos del navegador para forzarla.
