# Conexión automática con Google Sheets · Volley Scout 2.1

## Actualización 2.1

Se conserva la URL vigente y el contrato 2. Si ya publicaste el Apps Script compatible con use/colocada, **no necesitás reemplazarlo por esta actualización**. La clasificación rotacional y su fuente se guardan en el registro JSON de **Volley Acciones V2**; el resumen anterior no cambia de columnas.

Publicá todo el contenido actualizado de `para_github`, incluidos `manifest.webmanifest`, `service-worker.js`, el puente `sw.js`, los tres PNG, las tres hojas CSS y todos los scripts. La primera apertura debe realizarse con Internet. Una actualización posterior se aplica cuando no haya rally abierto y todas las pestañas estén listas. La app no promete sincronización con la ventana cerrada.

Los pasos de Apps Script que siguen corresponden a la configuración inicial o a versiones anteriores que todavía no aceptan el detalle V2.

La página sigue enviando los datos a la misma hoja, sin pedir URL ni contraseña. El marcador y las acciones pendientes se guardan en este navegador; Sheets recibe los rallies cerrados.

## Publicar la actualización una sola vez

Antes de actualizar la web, descargá **Partidos → Descargar copia completa (.json)** desde el navegador donde cargás los partidos.

1. En tu hoja, abrí **Extensiones → Apps Script**.
2. Reemplazá todo el contenido de **Código.gs** por el archivo completo **google-apps-script.gs** de esta versión y guardá.
3. Entrá en **Implementar → Gestionar implementaciones → Editar (lápiz)**.
4. En **Versión**, elegí **Nueva versión** y tocá **Implementar**. Usá la implementación existente para conservar la URL.
5. En GitHub, subí **todo el contenido actualizado de para_github** a la carpeta donde está el `index.html` actual. Reemplazá los archivos del mismo nombre y agregá los nuevos. Incluí `sw.js`, las tres hojas CSS y todos los archivos JavaScript.
6. Esperá que GitHub Pages termine de publicar y abrí la página con Internet. Recargala para cargar la versión 2.1.
7. Cerrá un punto de prueba o tocá **Reintentar envío**. El aviso debe decir **Guardado confirmado en la hoja**.

La implementación web sigue ejecutándose como su propietario y permite acceso a **Cualquier persona**. La propiedad antigua `VOLLEY_TOKEN` no se usa. El enlace recibe datos sin clave; los permisos de lectura de la hoja siguen siendo los que configuraste.

Si aparece **Guardado confirmado (columnas anteriores)**, Google recibió los datos compatibles con la versión anterior, pero falta publicar el Apps Script nuevo para guardar todos los detalles 2.0.

El archivo `google-apps-script.gs` se pega en Google; no necesita subirse como parte de la web. Subirlo a GitHub por sí solo no actualiza la implementación de Google.

## Durante el partido

Los cambios se agrupan y se envían unos cuatro segundos después de la última modificación. Un rally abierto queda guardado en este dispositivo y se manda a Sheets cuando se cierra. No se inventa un punto para enviar acciones pendientes.

El aviso distingue:

- **Guardado local / envío pendiente:** la copia de este dispositivo está disponible, falta confirmación de Google.
- **Sin conexión:** se conserva la copia local y se reintenta al recuperar Internet.
- **Error de sincronización:** Google no confirmó el envío. El sitio continúa funcionando y reintenta a los 30 segundos, aumentando la espera hasta un máximo de cinco minutos.
- **Guardado confirmado en la hoja:** Google respondió que recibió el envío. Si hay un rally abierto, el aviso aclara que sus acciones siguen solamente en este dispositivo.

También podés tocar **Reintentar envío**. Volver a mandar los mismos IDs reemplaza sus registros y evita duplicaciones. Un error o una respuesta incompleta nunca se anuncia como éxito.

El envío admite hasta **200 partidos por solicitud**; al superar ese límite aparece un error explícito y los datos locales se conservan. Eliminar un partido local no elimina su copia en Sheets. Cargá cada partido desde un solo dispositivo para evitar que dos copias se reemplacen mutuamente.

## Pestañas y compatibilidad

Se mantienen los nombres y encabezados de las nueve pestañas existentes:

- Volley Partidos
- Volley Jugadores
- Volley Sets
- Volley Acciones
- Volley Formaciones
- Volley Cambios
- Volley Liberos
- Volley Rival
- Volley Bloqueos

**Volley Acciones conserva sus primeras 17 columnas**, incluidas las etiquetas históricas de fundamentos y resultados. **Volley Resumen no se modifica**: sus filtros y fórmulas manuales continúan usando esas columnas. No cambies los encabezados de las pestañas administradas.

La versión 2.0 agrega:

- **Volley Acciones V2:** IDs de acción y participantes, resultado estable, origen y destino opcionales, armador, atacante receptor, distribución, bloqueadores, ambigüedad histórica y el registro original.
- **Volley Rallies V2:** IDs de partido, set y rally, número, modo, causa colectiva, servicio y marcador previos, formación y calidad de la secuencia.

Las zonas no seleccionadas se guardan vacías. Un `Bloqueado` histórico solo se clasifica como punto rival de bloqueo cuando la última acción y el ganador lo prueban. Si hubo una acción posterior, se clasifica como cobertura; si falta evidencia, queda marcado como histórico ambiguo. El registro original se conserva en la pestaña V2.

El contrato acepta envíos anteriores `{matches:[...]}` y actuales `{schemaVersion:2,matches:[...]}`. La respuesta actual incluye `ok:true` y `contractVersion:2`. No se envían contraseñas.

Apps Script valida los datos y todos los encabezados antes de escribir. Google no ofrece una transacción única entre pestañas: si una escritura falla durante el envío, no se confirma y el siguiente intento repara las filas por ID.

## Usar desde el celular sin conexión

Primero abrí la versión actualizada con Internet para que el navegador descargue la página y todos sus recursos. `sw.js` prepara la copia de la web para futuras aperturas sin conexión. No alcanza con subir únicamente `index.html`: si falta un archivo nuevo, la copia offline no puede completarse.

Probá en un partido de prueba: activá modo avión, registrá una acción y recargá. El rally abierto debe seguir disponible. Cerrá el punto, recuperá Internet y comprobá el aviso de confirmación y la fila en Sheets.

## Recuperar una copia de seguridad

La aplicación conserva la clave local `volley_scout_avanzado_v1`. Antes de migrar se guarda una copia íntegra del contenido anterior bajo esa clave con el sufijo `:backup:before-v2`; si ya existe una copia distinta, se usa un sufijo adicional. La migración no borra partidos, jugadores ni IDs.

En **Partidos → Copias de seguridad**, usá **Descargar respaldo anterior a 2.0** para guardar el original y **Descargar copia completa (.json)** para guardar el estado actual, incluidos equipos y rallies abiertos. Conservá ambos archivos fuera del navegador.

Para restaurar, elegí **Restaurar una copia (.json)** y revisá la confirmación antes de reemplazar los datos actuales. La aplicación guarda otro respaldo previo a la importación. También acepta copias anteriores y archivos de un solo partido.

Si no puede validar los datos o crear el respaldo, protege el original y ofrece **Descargar datos originales**. En ese estado la sincronización queda pausada. No borres los datos del navegador para resolver un error.


## Variantes de ataque: use y colocada

Actualizá la implementación existente con el `google-apps-script.gs` de esta entrega antes de usar los resultados nuevos en la web. Un script V2 anterior puede rechazarlos como resultado incompatible. No cambia la URL ni se agregan columnas a las pestañas existentes.

En **Volley Acciones**, use y colocada punto conservan «Punto» para que las fórmulas actuales sumen sus kills; colocada sigue conserva «Continuidad». En **Volley Acciones V2**, los resultados `use_block_out`, `tip_kill` y `tip_continue` y los metadatos distinguen cada variante. El bloqueador involucrado en un use se guarda en el detalle V2, sin registrar un punto de bloqueo en **Volley Bloqueos**.


## Entrenamientos — versión 2.2

Para aceptar sesiones de entrenamiento, copiá el archivo `google-apps-script.gs` completo y publicá una nueva versión de la implementación actual, conservando su URL `/exec`. El cliente conserva los entrenamientos locales y pendientes hasta recibir `trainingContractVersion:1` y la confirmación exacta de ID/revisión. Las seis pestañas nuevas de entrenamiento son independientes de los partidos. Seguí `ACTUALIZAR_ENTRENAMIENTO.md` para el procedimiento completo.
