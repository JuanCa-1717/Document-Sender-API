# WhatsApp Document Sender API

API REST para enviar documentos por WhatsApp. Sin navegador, sin complicaciones.

## 🚀 URL de la API

```
https://document-sender-api-1.onrender.com
```

## 📋 Inicio Rápido

### 1. Conectar tu WhatsApp (solo la primera vez)

Cada usuario necesita su propio `clientId` único (ejemplo: tu nombre, empresa, proyecto).

```bash
curl -X POST https://document-sender-api-1.onrender.com/connect/mi-empresa
```

### 2. Ver el QR

Abre en tu navegador:
```
https://document-sender-api-1.onrender.com/qr/mi-empresa
```

### 3. Escanear con WhatsApp

- Abre WhatsApp en tu teléfono
- Ve a **Configuración → Dispositivos vinculados → Vincular dispositivo**
- Escanea el QR del navegador

### 4. Enviar documentos

```bash
curl -X POST https://document-sender-api-1.onrender.com/send/mi-empresa \
  -H "Content-Type: application/json" \
  -d '{
    "telefono": "50612345678",
    "url_documento": "https://ejemplo.com/documento.pdf",
    "caption": "Aquí está tu documento"
  }'
```

**Respuesta:**
```json
{
  "estado": "enviado",
  "mensaje": "Documento enviado correctamente",
  "id_mensaje": "3EB0...",
  "destinatario": "50612345678"
}
```

---

## 📡 Endpoints

### POST /connect/:clientId
Conecta una nueva sesión de WhatsApp.

**Parámetros:**
- `clientId` (URL): Identificador único (ej: "empresa-ventas")

**Respuesta:**
```json
{
  "status": "needs-scan",
  "qr": "data:image/png;base64,...",
  "qr_url": "https://...../qr/empresa-ventas",
  "message": "Escanea el QR"
}
```

**Posibles estados:**
- `needs-scan`: QR listo para escanear
- `already-connected`: Ya está conectado
- `connecting`: Conectando...

---

### GET /qr/:clientId
Muestra el QR directamente en el navegador.

**URL de ejemplo:**
```
https://document-sender-api-1.onrender.com/qr/mi-empresa
```

Abre esta URL en Chrome/Edge/Firefox para ver el QR.

---

### GET /status/:clientId
Verifica si una sesión está conectada.

**Ejemplo:**
```bash
curl https://document-sender-api-1.onrender.com/status/mi-empresa
```

**Respuesta:**
```json
{
  "clientId": "mi-empresa",
  "status": "connected",
  "connected": true
}
```

---

### POST /send/:clientId
Envía un documento o un mensaje de texto por WhatsApp.

**Parámetros (JSON):**
```json
{
  "telefono": "50612345678",
  "url_documento": "https://ejemplo.com/documento.pdf",
  "caption": "Texto del mensaje"
}
```

**Campos:**
- `telefono`: *(requerido)* Número con código de país (sin +, sin espacios)
- `url_documento`: *(opcional)* URL pública del documento
- `caption`: *(opcional)* Mensaje de texto

**Casos de uso:**

1. **Enviar documento con caption:**
```bash
curl -X POST https://document-sender-api-1.onrender.com/send/mi-empresa \
  -H "Content-Type: application/json" \
  -d '{
    "telefono": "50612345678",
    "url_documento": "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    "caption": "Documento importante"
  }'
```

2. **Enviar solo mensaje de texto (sin documento):**
```bash
curl -X POST https://document-sender-api-1.onrender.com/send/mi-empresa \
  -H "Content-Type: application/json" \
  -d '{
    "telefono": "50612345678",
    "caption": "Hola, este es un mensaje de prueba"
  }'
```

**Respuesta exitosa:**
```json
{
  "estado": "enviado",
  "mensaje": "Documento enviado correctamente",
  "id_mensaje": "3EB0C431D584B564E032",
  "destinatario": "50612345678"
}
```

O si es solo mensaje:
```json
{
  "estado": "enviado",
  "mensaje": "Mensaje enviado correctamente",
  "id_mensaje": "3EB0C431D584B564E032",
  "destinatario": "50612345678"
}
```

**Respuesta error:**
```json
{
  "estado": "fallido",
  "mensaje": "Cliente no conectado"
}
```

---

## 💡 Ejemplos de Uso

### PowerShell (Windows)

**Conectar:**
```powershell
Invoke-RestMethod -Method Post -Uri "https://document-sender-api-1.onrender.com/connect/mi-empresa"
```

**Enviar documento:**
```powershell
$body = @{
    telefono = "50612345678"
    url_documento = "https://ejemplo.com/doc.pdf"
    caption = "Tu documento"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "https://document-sender-api-1.onrender.com/send/mi-empresa" `
  -ContentType "application/json" `
  -Body $body
```

**Enviar solo mensaje:**
```powershell
$body = @{
    telefono = "50612345678"
    caption = "Hola, este es mi mensaje"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "https://document-sender-api-1.onrender.com/send/mi-empresa" `
  -ContentType "application/json" `
  -Body $body
```

---

### JavaScript (Node.js)

```javascript
const axios = require('axios');

const API = 'https://document-sender-api-1.onrender.com';
const CLIENT_ID = 'mi-empresa';

// Enviar documento
async function enviarDocumento(telefono, url, caption) {
  const { data } = await axios.post(`${API}/send/${CLIENT_ID}`, {
    telefono,
    url_documento: url,
    caption
  });
  return data;
}

// Enviar solo mensaje de texto
async function enviarMensaje(telefono, texto) {
  const { data } = await axios.post(`${API}/send/${CLIENT_ID}`, {
    telefono,
    caption: texto
  });
  return data;
}

// Uso
enviarDocumento('50612345678', 'https://ejemplo.com/doc.pdf', 'Hola')
  .then(res => console.log('Enviado:', res))
  .catch(err => console.error('Error:', err.response?.data));

// O solo mensaje
enviarMensaje('50612345678', 'Hola, ¿cómo estás?')
  .then(res => console.log('Enviado:', res))
  .catch(err => console.error('Error:', err.response?.data));
```

---

### Python

```python
import requests

API = 'https://document-sender-api-1.onrender.com'
CLIENT_ID = 'mi-empresa'

def enviar_documento(telefono, url, caption=''):
    response = requests.post(f'{API}/send/{CLIENT_ID}', json={
        'telefono': telefono,
        'url_documento': url,
        'caption': caption
    })
    return response.json()

def enviar_mensaje(telefono, texto):
    response = requests.post(f'{API}/send/{CLIENT_ID}', json={
        'telefono': telefono,
        'caption': texto
    })
    return response.json()

# Uso
resultado = enviar_documento('50612345678', 'https://ejemplo.com/doc.pdf', 'Hola')
print(resultado)

# O solo mensaje
resultado = enviar_mensaje('50612345678', 'Hola, ¿cómo estás?')
print(resultado)
```

---

### PHP

```php
<?php
$api = 'https://document-sender-api-1.onrender.com';
$clientId = 'mi-empresa';

// Enviar documento
$data = [
    'telefono' => '50612345678',
    'url_documento' => 'https://ejemplo.com/doc.pdf',
    'caption' => 'Tu documento'
];

$ch = curl_init("$api/send/$clientId");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

$response = curl_exec($ch);
curl_close($ch);

print_r(json_decode($response, true));

// Enviar solo mensaje
$data = [
    'telefono' => '50612345678',
    'caption' => 'Hola, este es mi mensaje'
];

$ch = curl_init("$api/send/$clientId");
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

$response = curl_exec($ch);
curl_close($ch);

print_r(json_decode($response, true));
?>
```

---

## ❓ Preguntas Frecuentes

### ¿Cómo obtengo mi clientId?
Puedes usar cualquier identificador único: tu nombre, empresa, proyecto, etc. Ejemplo: `empresa-ventas`, `cliente-123`, `juan-dev`.

### ¿El QR expira?
No, mientras no cierres sesión en WhatsApp. Si el servidor se reinicia, la sesión se recupera automáticamente desde la base de datos SQLite.

### ¿Puedo tener múltiples clientId?
Sí, cada `clientId` es una sesión independiente. Puedes conectar múltiples números de WhatsApp.

### ¿Qué formatos de documento soporta?
PDF, DOC, DOCX, XLS, XLSX, JPG, PNG, etc. Cualquier archivo que WhatsApp permita.

### ¿El número debe tener código de país?
Sí, el formato es: `código_país + número` sin símbolos. Ejemplo: `50612345678` (no `+506-1234-5678`).

### ¿La URL del documento debe ser pública?
Sí, la API necesita descargar el documento desde la URL. Usa servicios como Google Drive (link público), Dropbox, S3, etc.

### ¿Cuántos mensajes puedo enviar?
Ilimitados, pero respeta las políticas de WhatsApp para evitar baneos (no spam masivo).

---

## 🔐 Seguridad

- Cada `clientId` es independiente
- Las sesiones se guardan encriptadas en archivos locales de Baileys
- Los metadatos de sesión se guardan en SQLite (base de datos persistente)
- Solo tú puedes usar tu `clientId` una vez conectado
- Recomendado: Usar HTTPS siempre
- ✨ **NUEVO:** Las sesiones persisten entre reinicios del servidor (disco persistente en Render)

---

## 🐛 Solución de Problemas

**Error: "Cliente no conectado"**
```bash
# Verifica el estado
curl https://document-sender-api-1.onrender.com/status/mi-empresa

# Si no está conectado, reconecta
curl -X POST https://document-sender-api-1.onrender.com/connect/mi-empresa
```

**Error: "Faltan parámetros"**
- Verifica que envíes `telefono` y `url_documento` en el JSON
- Usa `Content-Type: application/json`

**Error al descargar documento**
- Verifica que la URL sea pública y accesible
- Prueba la URL en tu navegador primero

**Número incorrecto**
- Formato: solo dígitos con código de país
- ✅ Correcto: `50612345678`
- ❌ Incorrecto: `+506-1234-5678` o `1234-5678`

---

