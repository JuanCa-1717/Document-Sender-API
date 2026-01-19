Proyecto: WhatsApp Doc Sender

Descripción
- Automatiza el envío de documentos a un número de WhatsApp usando `@wppconnect-team/wppconnect`.

Instalación

```powershell
npm install
```

Uso

- Formato de número: usar sin `@c.us`, por ejemplo `5213312345678` para México.

Ejecutar (inicia wppconnect y envía un archivo):

```powershell
node index.js <numero_sin_codigo> <rutaArchivo> [nombreArchivo] [caption]
```

Ejemplo:

```powershell
node index.js 5213312345678 ./docs/contrato.pdf contrato "Aquí está el contrato"
```

Notas
- La primera vez verás un QR; escanéalo con tu WhatsApp.
- Guarda sesiones según necesites (wppconnect soporta persistencia de sesión si lo configuras).
