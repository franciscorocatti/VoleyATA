# Conectar Volley Scout con tu hoja

Identificación de bloqueadores: publicá también `blocker-tracking.js` con la página. La versión actual de Apps Script agrega `Volley Bloqueos`, con atacante, bloqueador rival y si el bloqueo terminó en punto. Actualizá la implementación para guardar esos datos en Sheets; la URL y la clave se conservan.

Actualización de formaciones: publicá también `team-management.js` junto con la página. Reemplazá el código de Apps Script por la versión actual de `google-apps-script.gs` y publicá una nueva versión de la implementación, conservando URL y clave. Se agregan las pestañas `Volley Formaciones`, `Volley Cambios`, `Volley Liberos` y `Volley Rival`. Las pestañas anteriores se conservan. La formación rival incluye posición al registrar, posición actual y marcador de carga.

Los datos se cargan en la página y se envían a la hoja que compartiste. Esta conexión queda pendiente hasta publicar el script y pegar su URL en la página.

1. Abrí tu hoja: https://docs.google.com/spreadsheets/d/1zzQpnoHHJNvNVTPdOyPkhcwftZUucV0tFPwxeYZdQpE/edit
2. Entrá a **Extensiones → Apps Script**.
3. Reemplazá el código inicial por todo el contenido de `google-apps-script.gs` y guardá.
4. En **Configuración del proyecto → Propiedades de la secuencia de comandos**, agregá una propiedad llamada `VOLLEY_TOKEN`. Como valor, usá una clave privada aleatoria de al menos 24 caracteres. Guardala: vas a pegar la misma clave en la página. No la publiques ni la incluyas en el código.
5. Elegí **Implementar → Nueva implementación → Aplicación web**. Configurá **Ejecutar como: Yo** y **Quién tiene acceso: Cualquier persona**. Autorizá el script para escribir en tu hoja. Si tu organización no permite esa opción, esta conexión requiere otro método de autenticación.
6. Copiá la URL de la aplicación web que termina en `/exec`.
7. Abrí la página actualizada. Desplegá **Google Sheets**, pegá la URL y la clave, y tocá **Guardar conexión y enviar**. Si todavía no hay partidos, creá uno.
8. Esperá a ver **Guardado confirmado** y abrí la hoja: deberían aparecer `Volley Partidos`, `Volley Jugadores`, `Volley Sets` y `Volley Acciones`. El primer partido es la prueba real de la conexión; hasta entonces no está verificada.

Las pestañas se crean automáticamente en el primer envío. No hace falta preparar columnas ni publicar la hoja. La pestaña original se conserva. Las pestañas `Volley …` son administradas por la página: usá otras pestañas para fórmulas o análisis propios y mantené sus encabezados sin cambios.

Los cambios se envían a los 4 segundos del último guardado, agrupados para evitar un envío por cada clic. Las acciones se guardan al cerrar el rally. Deshacer un punto corrige también las filas de la hoja en el siguiente envío, sin duplicarlas. El botón **Enviar todos los partidos** permite volver a enviar las copias locales completas.

Si se corta Internet, seguí cargando. Se conserva la copia local y se reintenta al recuperar conexión, abrir la página o hacer un nuevo cambio. Si cerrás la página antes de la confirmación, volvé a abrirla para completar el envío. Si falla, revisá URL, clave, acceso público de la aplicación web y permisos del propietario. Un envío sin respuesta puede haberse guardado: reintentar actualiza los mismos partidos.

La conexión envía hasta 200 partidos locales por solicitud. No descarga partidos desde Sheets a otros dispositivos. Cargá cada partido desde un único dispositivo para evitar que una copia vieja reemplace otra. Eliminar un partido local no borra su copia en Google Sheets. Seguí exportando JSON para restaurar los partidos en la aplicación.

Para publicar la página, subí `index.html`, `sheets-sync.js`, `team-management.js`, `saved-teams.js`, `formation-stats.js`, `sequence-stats.js`, `blocker-tracking.js`, `responsive.css` y esta guía al mismo directorio del sitio. El script `.gs` se pega en Google y no necesita publicarse con la web. Si modificás ese script, actualizá su implementación desde **Implementar → Gestionar implementaciones → Editar → Nueva versión**.

Referencia de Google: https://developers.google.com/apps-script/guides/web
