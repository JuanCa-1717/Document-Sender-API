// app-mongodb.js - API con MongoDB para sesiones persistentes

const express = require('express');
const makeWASocket = require('@whiskeysockets/baileys').default;
const { DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const axios = require('axios');
const path = require('path');
const pino = require('pino');
const { MongoClient } = require('mongodb');
const { useMongoDBAuthState } = require('./mongodb-auth-state');

const app = express();
app.use(express.json());

// CONFIGURACIÓN MONGODB
// Reemplaza con tu URL de MongoDB Atlas o cualquier otra DB
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017';
const DB_NAME = 'whatsapp_sessions';

let mongoClient;
let sessionsCollection;

// Conectar a MongoDB
async function connectMongoDB() {
  try {
    mongoClient = new MongoClient(MONGODB_URL, {
      tls: true,
      tlsAllowInvalidCertificates: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    await mongoClient.connect();
    const db = mongoClient.db(DB_NAME);
    sessionsCollection = db.collection('sessions');
    console.log('✅ MongoDB conectado');
  } catch (error) {
    console.error('❌ Error conectando a MongoDB:', error.message);
    process.exit(1);
  }
}

const sessions = new Map(); // clientId -> { sock, qr, status }
const logger = pino({ level: 'silent' });

// POST /connect/:clientId - Genera conexión y devuelve QR
app.post('/connect/:clientId', async (req, res) => {
  const { clientId } = req.params;
  
  try {
    if (sessions.has(clientId) && sessions.get(clientId).status === 'connected') {
      return res.json({ status: 'already-connected', message: 'Ya está conectado' });
    }

    // Usar MongoDB en lugar de archivos
    const { state, saveCreds } = await useMongoDBAuthState(sessionsCollection, clientId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ['WhatsApp API', 'Chrome', '4.0.0']
    });

    let qrData = null;

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrData = await QRCode.toDataURL(qr);
        sessions.set(clientId, { sock, qr: qrData, status: 'needs-scan', saveCreds });
      }

      if (connection === 'open') {
        sessions.set(clientId, { sock, qr: null, status: 'connected', saveCreds });
        console.log(`✓ Cliente ${clientId} conectado`);
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          console.log(`↻ Reconectando ${clientId}...`);
          setTimeout(() => reconnect(clientId), 3000);
        } else {
          sessions.delete(clientId);
          await sessionsCollection.deleteOne({ clientId });
          console.log(`✗ Cliente ${clientId} desconectado (logout)`);
        }
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // Esperar QR (máximo 10 segundos)
    for (let i = 0; i < 20; i++) {
      if (qrData) break;
      await new Promise(r => setTimeout(r, 500));
    }

    const protocol = req.protocol;
    const host = req.get('host');
    const qrUrl = qrData ? `${protocol}://${host}/qr/${clientId}` : null;

    if (qrData) {
      res.json({ status: 'needs-scan', qr: qrData, qr_url: qrUrl, message: 'Escanea el QR' });
    } else {
      res.json({ status: 'connecting', message: 'Conectando...' });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /connect/:clientId - Verifica estado de conexión
app.get('/connect/:clientId', (req, res) => {
  const { clientId } = req.params;
  const session = sessions.get(clientId);

  if (!session) {
    return res.json({ status: 'disconnected', message: 'No hay sesión activa' });
  }

  const protocol = req.protocol;
  const host = req.get('host');
  const qrUrl = session.qr ? `${protocol}://${host}/qr/${clientId}` : null;

  res.json({
    status: session.status,
    qr: session.qr || null,
    qr_url: qrUrl,
    message: session.status === 'connected' ? 'Conectado' : 'Esperando escaneo'
  });
});

// GET /qr/:clientId - Muestra el QR directamente como imagen PNG
app.get('/qr/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const session = sessions.get(clientId);

  if (!session || !session.qr) {
    return res.status(404).send(`
      <html>
        <body style="font-family: Arial; text-align: center; padding: 50px;">
          <h2>❌ No hay QR disponible</h2>
          <p>Primero conecta con: POST /connect/${clientId}</p>
        </body>
      </html>
    `);
  }

  const base64Data = session.qr.replace(/^data:image\/png;base64,/, '');
  const imgBuffer = Buffer.from(base64Data, 'base64');

  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': imgBuffer.length
  });
  res.end(imgBuffer);
});

// POST /send/:clientId - Envía documento
app.post('/send/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const { telefono, url_documento, caption = '' } = req.body;

  if (!telefono || !url_documento) {
    return res.status(400).json({ error: 'Faltan parámetros: telefono, url_documento' });
  }

  const session = sessions.get(clientId);
  if (!session || session.status !== 'connected') {
    return res.status(400).json({ estado: 'fallido', mensaje: 'Cliente no conectado' });
  }

  try {
    const response = await axios.get(url_documento, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const fileName = path.basename(new URL(url_documento).pathname) || 'documento.pdf';
    const mimeType = response.headers['content-type'] || 'application/pdf';

    let jid = telefono.replace(/[^0-9]/g, '');
    if (!jid.includes('@')) jid += '@s.whatsapp.net';

    const result = await session.sock.sendMessage(jid, {
      document: buffer,
      fileName: fileName,
      mimetype: mimeType,
      caption: caption
    });

    console.log(`✓ Documento enviado a ${telefono} (${clientId})`);
    
    res.json({
      estado: 'enviado',
      mensaje: 'Documento enviado correctamente',
      id_mensaje: result.key.id,
      destinatario: telefono
    });
    
  } catch (error) {
    console.error('Error enviando:', error.message);
    res.status(500).json({
      estado: 'fallido',
      mensaje: error.message
    });
  }
});

// GET /status/:clientId - Estado de la conexión
app.get('/status/:clientId', (req, res) => {
  const { clientId } = req.params;
  const session = sessions.get(clientId);

  res.json({
    clientId,
    status: session ? session.status : 'disconnected',
    connected: session?.status === 'connected'
  });
});

// Función de reconexión automática
async function reconnect(clientId) {
  try {
    const { state, saveCreds } = await useMongoDBAuthState(sessionsCollection, clientId);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect } = update;

      if (connection === 'open') {
        sessions.set(clientId, { sock, qr: null, status: 'connected', saveCreds });
        console.log(`✓ Cliente ${clientId} reconectado`);
      }

      if (connection === 'close') {
        const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
        if (shouldReconnect) setTimeout(() => reconnect(clientId), 5000);
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (error) {
    console.error(`Error reconectando ${clientId}:`, error.message);
  }
}

const PORT = process.env.PORT || 3000;

// Iniciar servidor después de conectar MongoDB
connectMongoDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 API WhatsApp escuchando en puerto ${PORT}`);
    console.log(`📡 Endpoints:`);
    console.log(`   POST /connect/:clientId  - Conectar y obtener QR`);
    console.log(`   GET  /qr/:clientId       - Ver QR en navegador`);
    console.log(`   GET  /connect/:clientId  - Verificar estado`);
    console.log(`   POST /send/:clientId     - Enviar documento`);
    console.log(`   GET  /status/:clientId   - Estado conexión`);
  });
});

// Cerrar MongoDB al terminar
process.on('SIGINT', async () => {
  if (mongoClient) await mongoClient.close();
  process.exit(0);
});
