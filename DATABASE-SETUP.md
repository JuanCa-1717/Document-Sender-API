# Configuración de Base de Datos Externa

Esta guía te muestra cómo usar MongoDB (u otra DB) para mantener las sesiones persistentes en lugar de archivos locales.

## 🎯 Opciones de Base de Datos Gratuitas

### 1. MongoDB Atlas (Recomendado)

**Características:**
- ✅ 512MB gratis
- ✅ Ideal para JSON
- ✅ Sin tarjeta de crédito
- ✅ Global

**Configuración:**

1. **Crear cuenta en MongoDB Atlas:**
   - Ve a: https://www.mongodb.com/cloud/atlas/register
   - Registrate gratis

2. **Crear cluster:**
   - Clic en "Build a Database"
   - Selecciona "M0 Free"
   - Elige región más cercana

3. **Configurar acceso:**
   - Username: `whatsapp_api`
   - Password: (genera uno seguro)
   - Whitelist IP: `0.0.0.0/0` (permite todas las IPs)

4. **Obtener connection string:**
   ```
   mongodb+srv://whatsapp_api:<password>@cluster0.xxxxx.mongodb.net/whatsapp_sessions
   ```

---

### 2. Railway PostgreSQL

**Características:**
- ✅ $5 crédito gratis/mes
- ✅ PostgreSQL
- ✅ Disco persistente incluido

**Configuración:**
- Crea proyecto en Railway
- Agrega PostgreSQL database
- Obtén la URL de conexión

(Requiere adapter diferente para PostgreSQL)

---

### 3. Supabase

**Características:**
- ✅ 500MB gratis
- ✅ PostgreSQL
- ✅ Sin tarjeta

**Configuración:**
- Registrate en https://supabase.com
- Crea proyecto
- Obtén connection string

---

## 📦 Instalación

1. **Instala MongoDB driver:**
```bash
npm install mongodb
```

2. **Configura la URL de conexión:**

Crea archivo `.env`:
```bash
MONGODB_URL=mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/whatsapp_sessions
PORT=3000
```

3. **Usa el archivo con MongoDB:**
```bash
node app-mongodb.js
```

---

## 🔧 Configuración en Render

En el dashboard de Render:

1. **Environment Variables:**
   - Clave: `MONGODB_URL`
   - Valor: `mongodb+srv://...` (tu connection string)

2. **Start Command:**
   - Cambia de `node app.js` a `node app-mongodb.js`

---

## 🔄 Migrar de Archivos a MongoDB

Si ya tienes sesiones en archivos locales y quieres migrarlas a MongoDB:

```javascript
// migration.js
const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const client = new MongoClient(process.env.MONGODB_URL);
  await client.connect();
  const collection = client.db('whatsapp_sessions').collection('sessions');

  const sessionsDir = './sessions';
  const clients = fs.readdirSync(sessionsDir);

  for (const clientId of clients) {
    const clientPath = path.join(sessionsDir, clientId);
    const credsPath = path.join(clientPath, 'creds.json');
    
    if (fs.existsSync(credsPath)) {
      const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
      
      await collection.updateOne(
        { clientId },
        { $set: { clientId, creds, keys: {}, updatedAt: new Date() } },
        { upsert: true }
      );
      
      console.log(`✓ Migrado: ${clientId}`);
    }
  }

  await client.close();
  console.log('✅ Migración completada');
}

migrate();
```

---

## 📊 Ventajas vs Archivos Locales

| Aspecto | Archivos Locales | MongoDB |
|---------|------------------|---------|
| **Persistencia** | ❌ Se pierde en reinicios (Render) | ✅ Siempre persiste |
| **Multi-instancia** | ❌ No soporta | ✅ Múltiples servidores |
| **Backups** | ❌ Manual | ✅ Automático |
| **Escalabilidad** | ❌ Limitada | ✅ Ilimitada |
| **Costo** | ✅ Gratis | ✅ Gratis (hasta 512MB) |

---

## 🧪 Probar MongoDB Local (Desarrollo)

Si quieres probar localmente antes de usar Atlas:

1. **Instala MongoDB local:**
   - Windows: https://www.mongodb.com/try/download/community
   - Mac: `brew install mongodb-community`
   - Linux: `sudo apt-get install mongodb`

2. **Inicia MongoDB:**
```bash
mongod
```

3. **Usa URL local:**
```bash
MONGODB_URL=mongodb://localhost:27017 node app-mongodb.js
```

---

## 🔐 Seguridad

**Mejores prácticas:**

1. **Nunca expongas credenciales en código**
   - Usa variables de entorno
   - Agrega `.env` a `.gitignore`

2. **Restringe acceso por IP (producción)**
   - En MongoDB Atlas, configura IP whitelist específica
   - En lugar de `0.0.0.0/0` usa la IP de Render

3. **Usa SSL/TLS**
   - MongoDB Atlas lo incluye por defecto (`mongodb+srv://`)

---

## 🚀 Deploy

**Opción 1: Render con MongoDB Atlas**
1. Crea DB en Atlas (gratis)
2. Configura `MONGODB_URL` en Render
3. Cambia start command a `node app-mongodb.js`
4. Deploy

**Opción 2: Railway (todo incluido)**
1. Deploy app en Railway
2. Agrega PostgreSQL addon
3. Usa `app-postgresql.js` (requiere adapter diferente)

---

## ❓ FAQ

**¿Necesito pagar?**
- MongoDB Atlas: 512MB gratis (suficiente para 100+ sesiones)
- Railway: $5 crédito gratis/mes

**¿Puedo usar PostgreSQL en lugar de MongoDB?**
- Sí, pero necesitas otro adapter (más complejo)

**¿Las sesiones son seguras?**
- Sí, las credenciales se guardan encriptadas

**¿Puedo cambiar de archivos a MongoDB sin perder sesiones?**
- Sí, usa el script de migración incluido arriba

**¿Qué pasa si MongoDB cae?**
- La app intentará reconectar automáticamente
- Las sesiones activas en memoria seguirán funcionando
