# Conexión automática con Google Sheets

La página envía los datos a tu hoja automáticamente. No pide URL ni contraseña.

## Activar la versión sin clave (una sola vez)

1. En tu hoja, abrí **Extensiones → Apps Script**.
2. Reemplazá todo el código de **Código.gs** por el contenido completo de **google-apps-script.gs** y guardá.
3. Elegí **Implementar → Gestionar implementaciones → Editar (lápiz)**.
4. En Versión elegí **Nueva versión** y tocá **Implementar**. Conservá la implementación existente para mantener la misma URL.
5. Subí a GitHub todos los archivos que están dentro de **para_github** y recargá la página.
6. Creá un partido o cerrá un punto. El aviso al pie debe mostrar **Guardado confirmado**.

La propiedad antigua VOLLEY_TOKEN ya no se usa. El enlace de recepción permite enviar datos sin clave; la hoja conserva sus permisos de lectura existentes.

La implementación web debe seguir ejecutándose como su propietario y permitir acceso a Cualquier persona. Si tu organización no lo permite, este método necesita otra integración.

## Durante el partido

Los cambios guardados se envían a los 4 segundos de la última modificación. Las acciones se guardan al cerrar el rally. Sin Internet se conserva la copia local y se reintenta al recuperar conexión o volver a abrir la página. También podés tocar **Reintentar envío** al pie. Un fallo nunca se muestra como guardado confirmado.

Eliminar un partido local no borra su copia en Sheets. El envío admite hasta 200 partidos por solicitud. Cargá cada partido desde un solo dispositivo. Seguí exportando la copia JSON completa para restaurar partidos y equipos guardados en otro dispositivo.

El script administra Volley Partidos, Volley Jugadores, Volley Sets, Volley Acciones, Volley Formaciones, Volley Cambios, Volley Liberos, Volley Rival y Volley Bloqueos. No edites sus encabezados. Volley Resumen se conserva y recalcula sus porcentajes al llegar las acciones.

Para publicar, subí todos los archivos de **para_github** a la misma carpeta de GitHub donde está index.html. El archivo google-apps-script.gs se pega en Google; no necesita publicarse con la web.
