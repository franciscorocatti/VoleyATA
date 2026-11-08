# Volley Scout 2.2 — actualizar y usar Entrenamiento

## Actualizar

1. En la página actual descargá una **copia JSON** de tus partidos. Conservá ese archivo.
2. En tu hoja, abrí **Extensiones → Apps Script**. Reemplazá `Código.gs` por **todo** el contenido de `google-apps-script.gs` de esta entrega, desde la primera hasta la última línea. Guardá.
3. En Apps Script: **Implementar → Administrar implementaciones → lápiz → Nueva versión → Implementar**. Conservá la implementación actual y su URL terminada en `/exec`. No hace falta crear una clave ni cambiar la URL del sitio.
4. Subí **el contenido de `para_github`** a la raíz del repositorio `VoleyATA`, reemplazando archivos con el mismo nombre y agregando los nuevos. `index.html` debe seguir en la raíz. No publiques las carpetas de desarrollo, respaldos o pruebas. El archivo `.gs` se usa en Apps Script; no es un recurso necesario de GitHub Pages.
5. Abrí la página publicada **con conexión**, esperá el aviso de nueva versión y pausá el entrenamiento o terminá el rally. Desde el historial, presioná **Actualizar ahora**. Cerrá otras pestañas que estén registrando.
6. Esperá el mensaje **Aplicación preparada para abrir sin conexión**. Después probá abrirla en modo avión. No borres los datos del navegador ni desinstales la app para actualizar.

Si Google todavía no acepta entrenamientos, aparecerá error de sincronización. Los datos locales quedan guardados. Después de actualizar Apps Script, presioná **Sincronizar ahora**.

## Crear un entrenamiento

1. Elegí **ENTRENAMIENTO → ＋ Entrenamiento**.
2. Elegí un plantel guardado, de un partido o de un entrenamiento anterior. Indicá equipo, fecha, nombre y objetivo opcional. Marcá los participantes; podés agregar jugadores.
3. Presioná **Crear y guardar sesión**. La sesión ya queda en el dispositivo.
4. Agregá un ejercicio:
   - **Repeticiones**: sin marcador. Elegí jugador, fundamento y resultado. Cada toque registra un intento; mantiene jugador, fundamento y zonas seleccionados. Podés definir las consignas de cada resultado. Para saque dirigido, configurá una zona objetivo y registrá el destino real de cada saque.
   - **Juego**: elegí formato, jugadores, servicio y puntaje objetivo. Dejá el puntaje vacío para terminar manualmente. Los seis puestos corresponden a posiciones reglamentarias; con menos jugadores no hay rotaciones ni roles delantero/zaguero. Podés desactivar las rotaciones o los indicadores de side-out/break-point si el ejercicio no tiene esa estructura.
5. Usá **＋ Ejercicio** para continuar con otro. Podés alternar ejercicios sin perder los anteriores.
6. **Pausar** guarda y vuelve al historial. **Continuar** permite retomar. **Finalizar sesión** abre el informe. También se puede reabrir una sesión finalizada para corregirla.

En juegos: los resultados terminales cierran el rally si está activado el cierre automático. En avanzado podés indicar el bloqueador rival antes de registrar. **Deshacer** quita primero la última acción pendiente; sin pendientes recupera el rally anterior, sus acciones, marcador y formación. Los cambios y líberos se configuran entre rallies; los líberos conservan las reglas del modo Partido en juegos de seis.

## Leer el informe

Entrá a **Estadísticas** y filtrá por ejercicio, jugador o fundamento. Los detalles de cada jugador son desplegables.

- Los éxitos técnicos de ataque y bloqueo se separan de puntos competitivos.
- Un saque sin receptores no genera un ace real. Los aciertos al objetivo usan los destinos registrados.
- La eficacia competitiva de ataque usa únicamente intentos de juego: `(kills − errores) / intentos`. Bloqueo punto cuenta como error; bloqueo cubierto continúa.
- **No aplica** indica que no existe un contexto válido para ese indicador. Los porcentajes sin intentos también se muestran así.
- La evolución muestra numeradores, denominadores y variación en puntos porcentuales. Requiere el mismo jugador y equipo, una sesión anterior finalizada y ejercicios compatibles. Usá la misma **clave de comparación** para consignas equivalentes con distintos nombres. Se compara tipo, formato, nombre/clave, zona objetivo y definiciones de resultados.
- Los informes describen acciones registradas; un rally cargado parcialmente no representa todos sus contactos.

**CSV**, **JSON** e **Imprimir / PDF** funcionan sin servidores externos. Para PDF elegí la opción de guardar PDF del navegador cuando esté disponible.

## Guardado y sincronización

Los partidos conservan su almacenamiento anterior. Los entrenamientos usan **IndexedDB** y un journal en `localStorage` para recuperar escrituras interrumpidas. Si IndexedDB no está disponible, se conserva el journal como almacenamiento alternativo y se avisa. Los límites dependen del navegador.

Cada sesión, ejercicio, acción y rally tiene un ID estable. Cada modificación genera una revisión de la sesión. La revisión pendiente forma parte de la copia local y sobrevive al cierre. El envío se intenta al abrir la app, al recuperar conexión y al presionar **Sincronizar ahora**. Se envía una sesión por petición y se reintenta con espera progresiva si falla.

**Sincronizado** solo aparece después de recibir confirmación del ID y la revisión enviada. Si hubo cambios durante un envío, siguen pendientes. Los reintentos reemplazan filas de la misma sesión por ID, sin agregar duplicados. Los rallies abiertos se guardan como borradores, nunca como puntos confirmados.

La hoja agrega seis pestañas independientes: `Volley Entrenamientos`, `Volley Entreno Jugadores`, `Volley Entreno Ejercicios`, `Volley Entreno Acciones`, `Volley Entreno Rallies` y `Volley Entreno Copia`. Los partidos, sus columnas anteriores y `Volley Resumen` mantienen su contrato. La copia JSON remota se divide en partes para respetar el límite de cada celda.

No se promete sincronización con la app cerrada. En iPhone puede ser necesario volver a abrirla. Registrar acciones y consultar estadísticas nunca espera a Google.

## Respaldos y recuperación

- **Copia completa JSON** incluye partidos, planteles, borradores, preferencias y entrenamientos.
- **JSON** en una sesión exporta solo ese entrenamiento.
- **Copias de recuperación** descarga los datos locales, journals originales y respaldos previos a importaciones. Los objetos `value` de esos respaldos contienen la copia anterior; pueden guardarse como JSON para restaurarlos.
- Una importación se valida y pide confirmación antes de reemplazar datos. Se conserva un respaldo previo. Una copia antigua que solo tiene partidos conserva los entrenamientos actuales.
- Si el almacenamiento no puede escribirse, descargá inmediatamente una copia de los datos en memoria. No cierres ni recargues hasta exportarla.
- Si se detectan dos copias distintas de la misma revisión, se protege el almacenamiento y se permite exportar ambas. No edites la misma sesión desde dos pestañas o dispositivos a la vez.
- Eliminar una sesión pide confirmación y la elimina del historial de ese dispositivo. No elimina su copia remota ni restaura automáticamente datos desde Sheets; para mover o recuperar sesiones usá JSON.

Borrar datos del navegador, usar navegación privada o eliminar el almacenamiento de la app puede perder información. Exportá copias periódicas. En iPhone, Safari y la app agregada a inicio pueden tener almacenamientos separados: trasladá una copia JSON sin borrar el original.

## Alcance de las pruebas

Se ejecutaron pruebas automatizadas y pruebas reales en Chrome de escritorio con anchos móviles, modo offline, cierre/reapertura del navegador y actualización de la PWA. Los envíos se verificaron con el consumidor Apps Script en un simulador de Sheets y con respuestas controladas en el navegador. No se desplegó el nuevo Apps Script en tu cuenta ni se verificó el envío de entrenamiento en la hoja real. No hubo pruebas en teléfonos físicos Android/iPhone ni en Safari. Ver `INFORME_ENTRENAMIENTO.md` y los resultados adjuntos.
