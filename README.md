# WhatsApp Document Sender API (Baileys)

API REST para enviar documentos por WhatsApp usando `@whiskeysockets/baileys` (WebSocket puro, sin navegador).

## 🚀 Características

- ✅ API REST pura para desarrolladores
- ✅ Multi-sesión por clientId
- ✅ Reconexión automática
- ✅ QR en formato JSON (base64)
- ✅ Sin Puppeteer/Chromium/WhatsApp Web
- ✅ Gratuito, sin WhatsApp Business

## 📋 Requisitos

- Node.js 16 o superior
- Cuenta de WhatsApp personal

## 🔧 Instalación

```bash
npm install
```

## ▶️ Iniciar API

```bash
npm start
```

El servidor inicia en `http://localhost:3000`

## 📡 Endpoints

### 1. POST /connect/:clientId
Conecta una sesión y devuelve QR para escanear.

**Ejemplo:**
```bash
curl -X POST http://localhost:3000/connect/cliente123
```

**Respuesta:**
```json
{
  "status": "needs-scan",
  "qr": "data:image/png;base64,iVBORw0KG...",
  "message": "Escanea el QR"
}
```

### 2. GET /connect/:clientId
Verifica el estado de la conexión.

**Ejemplo:**
```bash
curl http://localhost:3000/connect/cliente123
```

**Respuesta:**
```json
{
  "status": "connected",
  "qr": null,
  "message": "Conectado"
}
```

### 3. POST /send/:clientId
Envía un documento por WhatsApp.

**Parámetros (JSON):**
- `telefono`: Número con código de país (ej: "50612345678")
- `url_documento`: URL pública del documento
- `caption`: Texto opcional del mensaje

**Ejemplo:**
```bash
curl -X POST http://localhost:3000/send/cliente123 \
  -H "Content-Type: application/json" \
  -d '{"telefono":"50612345678","url_documento":"https://ejemplo.com/documento.pdf","caption":"Aquí está tu documento"}'
```

**Respuesta:**
```json
{
  "estado": "enviando",
  "mensaje": "Descargando documento..."
}
```

### 4. GET /status/:clientId
Obtiene el estado actual de una sesión.

**Ejemplo:**
```bash
curl http://localhost:3000/status/cliente123
```

**Respuesta:**
```json
{
  "clientId": "cliente123",
  "status": "connected",
  "connected": true
}
```

## 🔄 Flujo de Uso

1. **Conectar cliente:**
   ```bash
   curl -X POST http://localhost:3000/connect/micliente
   ```

2. **Escanear QR:**
   - Abrir WhatsApp en el teléfono
   - Ir a Configuración → Dispositivos vinculados → Vincular dispositivo
   - Escanear el QR del JSON devuelto (campo `qr`)

3. **Verificar conexión:**
   ```bash
   curl http://localhost:3000/connect/micliente
   ```

4. **Enviar documento:**
   ```bash
   curl -X POST http://localhost:3000/send/micliente \
     -H "Content-Type: application/json" \
     -d '{"telefono":"50612345678","url_documento":"https://ejemplo.com/doc.pdf","caption":"Hola"}'
   ```

## 📁 Estructura

```
.
├── app.js              # API principal
├── package.json        # Dependencias
├── sessions/           # Sesiones por clientId (auto-generado)
│   ├── cliente1/
│   └── cliente2/
└── README.md
```

## 🔐 Multi-Sesión

Cada `clientId` mantiene su propia sesión independiente. Puedes tener múltiples clientes conectados simultáneamente:

```bash
# Cliente 1
curl -X POST http://localhost:3000/connect/empresa-ventas

# Cliente 2
curl -X POST http://localhost:3000/connect/empresa-soporte
```

## ⚙️ Estados de Conexión

- `disconnected`: Sin sesión activa
- `needs-scan`: Esperando escaneo del QR
- `connecting`: Conectando al servidor
- `connected`: Conectado y listo para enviar

## 🐛 Solución de Problemas

**Error: "Cliente no conectado"**
- Verifica que la sesión esté conectada con `GET /connect/:clientId`
- Reconecta con `POST /connect/:clientId`

**QR no aparece:**
- Espera 10 segundos y reintenta
- Verifica que no haya otra sesión activa en WhatsApp Web

**Error al enviar documento:**
- Verifica que la URL sea pública y accesible
- El número debe incluir código de país sin signos (ej: "50612345678")

## 📦 Dependencias

- `@whiskeysockets/baileys` - Cliente WhatsApp WebSocket
- `express` - Framework web
- `qrcode` - Generación de QR en base64
- `axios` - Descarga de documentos
- `pino` - Logger

## 📝 Notas

- Las sesiones se guardan en `./sessions/[clientId]`
- La reconexión es automática en caso de desconexión temporal
- No requiere WhatsApp Business API (gratuito)
- Compatible con WhatsApp personal

## 🚀 Producción

Para deploy en producción, configura la variable `PORT`:

```bash
PORT=8080 npm start
```

## 📄 Licencia

MIT
