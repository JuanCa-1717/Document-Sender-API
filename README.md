# 📱 WhatsApp Document Sender - Proyecto Completo

API REST para enviar documentos automáticamente por WhatsApp sin necesidad de navegador. Basada en Baileys, desplegada en Render con sesiones persistentes.

## 📁 Estructura del Proyecto

```
Document-Sender-API/
├── app.js                 # Aplicación principal (API Express)
├── clean-sessions.js      # Script para limpiar sesiones
├── package.json           # Dependencias y scripts
├── Dockerfile             # Configuración para Docker
├── render.yaml            # Configuración de deploy en Render
├── qr-temp.html          # Template HTML para QR (opcional)
├── API-DOCS.md           # Documentación de endpoints
├── README.md             # Este archivo
└── sessions/             # Almacenamiento de sesiones de WhatsApp
    └── test-client/      # Ejemplo de sesión
```

## 🛠️ Tecnologías

- **Node.js 20** - Runtime de JavaScript
- **Express** - Framework web minimalista
- **@whiskeysockets/baileys** - Librería para conectar WhatsApp sin navegador
- **QRCode** - Generación de códigos QR
- **Axios** - Cliente HTTP para descargar documentos
- **Pino** - Logger (silencioso en esta configuración)
- **Docker** - Containerización
- **Render** - Hosting en la nube

## 📋 Requisitos Previos

- **Node.js 20+** o **Docker**
- **npm** (incluido con Node.js)
- **Cuenta de Render** (para producción)
- **WhatsApp instalado en tu teléfono**

## ⚙️ Configuración Local

### 1. Clonar o descargar el proyecto

```bash
git clone <tu-repo>
cd Document-Sender-API
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Ejecutar en desarrollo

Con **nodemon** (reinicia automáticamente ante cambios):

```bash
npm run dev
```

O en modo producción:

```bash
npm start
```

La API estará disponible en: `http://localhost:3000`

## 🚀 Flujo de Uso

### Paso 1: Conectar WhatsApp

Haz una petición POST para iniciar una nueva sesión:

```bash
curl -X POST http://localhost:3000/connect/mi-cliente
```

**Respuesta:**
```json
{
  "status": "needs-scan",
  "qr": "data:image/png;base64,...",
  "message": "Escanea el QR"
}
```

### Paso 2: Ver el QR en navegador

Abre en tu navegador:
```
http://localhost:3000/qr/mi-cliente
```

O usa el QR devuelto en base64.

### Paso 3: Escanear con WhatsApp

1. Abre WhatsApp en tu teléfono
2. Ve a **Configuración → Dispositivos vinculados → Vincular dispositivo**
3. Escanea el código QR
4. Confirma en tu teléfono

### Paso 4: Enviar documentos

Una vez conectado (`status: "connected"`), envía documentos:

```bash
curl -X POST http://localhost:3000/send/mi-cliente \
  -H "Content-Type: application/json" \
  -d '{
    "telefono": "50612345678",
    "url_documento": "https://ejemplo.com/documento.pdf",
    "caption": "Aquí está tu documento"
  }'
```

## 📚 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/connect/:clientId` | Conectar WhatsApp y obtener QR |
| GET | `/connect/:clientId` | Verificar estado de conexión |
| GET | `/qr/:clientId` | Ver QR como imagen PNG |
| POST | `/send/:clientId` | Enviar documento por WhatsApp |
| GET | `/status/:clientId` | Obtener estado actual del cliente |

**Para detalles completos de cada endpoint**, ver [API-DOCS.md](API-DOCS.md)

## 🧹 Limpiar Sesiones

Para eliminar todas las sesiones almacenadas:

```bash
npm run clean
```

Este script elimina la carpeta `sessions/` completamente.

## 🐳 Ejecutar con Docker

### Buildear la imagen

```bash
docker build -t whatsapp-api .
```

### Ejecutar el contenedor

```bash
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -v sessions:/app/sessions \
  whatsapp-api
```

## 📦 Deploy en Render

El proyecto incluye `render.yaml` para despliegue automático.

### Pasos:

1. **Conectar tu repositorio** a Render.com
2. **Crear un servicio Web** desde el dashboard
3. **Render ejecutará automáticamente** los comandos del `render.yaml`
4. **Las sesiones se guardan** en `/data/sessions` (disco persistente de Render)

### Variables de entorno en Render:

```
NODE_ENV=production
PORT=10000
```

## 📂 Estructura de Sesiones

Las sesiones se guardan en `sessions/<clientId>/`:

```
sessions/
└── mi-cliente/
    ├── creds.json          # Credenciales de autenticación
    ├── device_list.json    # Lista de dispositivos
    ├── pre-key-*.json      # Claves de pre-encriptación
    └── session-*.json      # Sesiones activas
```

Cada `clientId` es independiente y puede conectarse a una cuenta de WhatsApp diferente.

## ⚡ Variables de Entorno

| Variable | Valor Por Defecto | Descripción |
|----------|------------------|-------------|
| `PORT` | `3000` | Puerto donde escucha la API |
| `NODE_ENV` | `development` | `development` o `production` |

## 🔍 Monitoreo y Logs

La API registra eventos importantes:

- ✓ Clientes conectados
- ✗ Desconexiones
- ↻ Reconexiones automáticas
- ✓ Documentos enviados
- ⚠️ Errores

Ejemplo de logs:
```
✓ Cliente mi-cliente conectado
✓ Documento enviado a 50612345678 (mi-cliente)
↻ Reconectando test-client...
```

## 🔒 Seguridad

- **Las sesiones se almacenan localmente** - No se envían a servidores externos
- **Credenciales encriptadas** - Baileys maneja la encriptación
- **Sin contraseñas** - Solo se usa el escaneo de QR
- **Dispositivo vinculado** - WhatsApp sigue siendo propiedad de tu cuenta

## 🐛 Troubleshooting

### "No hay QR disponible"
- El cliente no se ha conectado
- Ejecuta `POST /connect/:clientId` primero

### "Cliente no conectado"
- El cliente no ha escaneado el QR o no se reconectó
- Verifica con `GET /status/:clientId`

### "Error: ENOENT: no such file or directory"
- Las sesiones no existen o fueron eliminadas
- Vuelve a conectar con `POST /connect/:clientId`

### Reconexión infinita
- WhatsApp cerró la sesión
- Vuelve a escanear el QR

## 📝 Scripts Disponibles

```bash
npm start         # Ejecutar en producción
npm run dev       # Ejecutar con nodemon (desarrollo)
npm run clean     # Limpiar todas las sesiones
npm run test      # Ejecutar tests (si existen)
```

## 📄 Licencia

MIT

## 🤝 Contacto

Para preguntas o problemas, abre un issue en el repositorio.

---

**Última actualización:** Enero 2026  
**Versión:** 2.0.0
