require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const wppconnect = require('@wppconnect-team/wppconnect');
const qrcodeTerm = require('qrcode-terminal');

const app = express();
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage });

let clientInstance = null;
let clientReady = false;
let lastQr = null;
let lastState = null;
const lastEvents = [];

function pushEvent(name, data) {
  const item = { name, data, time: new Date().toISOString() };
  lastEvents.push(item);
  if (lastEvents.length > 80) lastEvents.shift();
  console.log(name, data || '');
}

(async () => {
  try {
    async function createClientWithFallback(baseSession) {
      const baseOptions = {
        session: baseSession,
        useChrome: false,
        headless: true,
        logQR: false,
        catchQR: (base64Qr, asciiQR) => {
          // store last QR (data:image/..;base64,...)
          lastQr = base64Qr;
          pushEvent('catchQR', { session: baseSession, qr: !!base64Qr });
          try {
            if (asciiQR) qrcodeTerm.generate(asciiQR, { small: true });
          } catch (e) {}
        },
        puppeteerOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox']
        }
      };

      try {
        return await wppconnect.create(baseOptions);
      } catch (err) {
        pushEvent('create-error', err && err.message);
        if (err && typeof err.message === 'string' && err.message.includes('already running')) {
          const alt = baseSession + '-' + Date.now();
          pushEvent('trying-fallback-session', alt);
          const altOptions = Object.assign({}, baseOptions, { session: alt });
          return await wppconnect.create(altOptions);
        }
        throw err;
      }
    }

    const client = await createClientWithFallback('whatsapp-doc-sender');
    clientInstance = client;

    lastQr = null; // Clear lastQr when client is created
    pushEvent('client-created', { type: typeof client, keys: Object.keys(client || {}).slice(0,50) });

    // If the client object already indicates a connected/logged state, mark ready.
    try {
      const connHints = {
        connected: client && client.connected,
        isLogged: client && client.isLogged,
        isInitialized: client && client.isInitialized
      };
      if (connHints.connected === true || connHints.isLogged === true || connHints.isInitialized === true) {
        clientReady = true;
        pushEvent('clientReady-detected', connHints);
      }
    } catch (e) {}

    const handlers = {
      qr: (qr) => { lastQr = qr; pushEvent('qr', qr); },
      ready: () => { clientReady = true; pushEvent('ready'); },
      authenticated: (session) => pushEvent('authenticated', session),
      auth_success: () => { clientReady = true; pushEvent('auth_success'); },
      auth_failure: (msg) => pushEvent('auth_failure', msg),
      disconnected: (reason) => { clientReady = false; pushEvent('disconnected', reason); },
      message: (msg) => pushEvent('message', msg),
      change_state: (state) => {
        lastState = state;
        pushEvent('change_state', state);
        try {
          const s = (typeof state === 'string') ? state : (state && state.toString && state.toString()) || '';
          if (s && typeof s === 'string' && s.toUpperCase().includes('CONNECT')) {
            clientReady = true;
            lastQr = null; // Clear lastQr when state changes to CONNECT
            pushEvent('clientReady', true);
          } else if (s && typeof s === 'string' && (s.toUpperCase().includes('CLOSE') || s.toUpperCase().includes('DISCONNECT'))) {
            clientReady = false;
            pushEvent('clientReady', false);
          }
        } catch (e) {}
      }
    };

    try {
      if (client && typeof client.on === 'function') {
        Object.keys(handlers).forEach(k => client.on(k, handlers[k]));
        pushEvent('events-registered', 'client.on');
      } else if (client && client.ev && typeof client.ev.on === 'function') {
        // some libs emit connection.update and messages.upsert instead
        client.ev.on('connection.update', (update) => {
          pushEvent('connection.update', update);
          if (update.qr) handlers.qr(update.qr);
          if (update.connection === 'open') handlers.ready();
          if (update.lastDisconnect) handlers.disconnected(update.lastDisconnect);
        });
        try { client.ev.on('messages.upsert', (m) => handlers.message(m)); } catch (e) {}
        pushEvent('events-registered', 'client.ev.on');
      } else if (typeof client.onStateChange === 'function') {
        client.onStateChange((state) => { handlers.change_state(state); });
        pushEvent('events-registered', 'onStateChange');
      } else {
        pushEvent('no-event-api', Object.keys(client || {}));
      }
    } catch (e) {
      pushEvent('register-error', e && e.message);
    }
  } catch (e) {
    console.error('Fallo iniciando wppconnect:', e);
  }
})();

// Serve the static web UI and parse JSON bodies
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/status', (req, res) => {
  const lastEvent = lastEvents.length ? lastEvents[lastEvents.length - 1] : null;
  res.json({ ready: clientReady, lastState, lastQr: !!lastQr, lastEvent });
});
app.get('/qr', (req, res) => res.json({ qr: lastQr }));
app.get('/debug', (req, res) => res.json({ ready: clientReady, lastState, lastQr: !!lastQr, events: lastEvents }));

app.post('/send', upload.single('file'), async (req, res) => {
  if (!clientInstance) return res.status(500).json({ error: 'Cliente no inicializado' });
  if (!clientReady) return res.status(400).json({ error: 'Cliente no listo. Escanea el QR.' });

  const phone = req.body.phone;
  if (!phone) return res.status(400).json({ error: 'Falta el número de teléfono' });

  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Falta el archivo' });

  function safeDecode(s) {
    try { if (typeof s === 'string') return decodeURIComponent(s); } catch (e) {}
    return s || '';
  }

  const caption = safeDecode(req.body.caption || '');
  const to = `${phone}@c.us`;

  try {
    // Try sending using a couple of common JIDs. Some clients expect different LIDs.
    const candidates = [to, `${phone}@s.whatsapp.net`];
    let lastErr = null;
    let sent = null;
    for (const cand of candidates) {
      try {
        const result = await clientInstance.sendFile(cand, file.path, file.originalname, caption);
        sent = { to: cand, result };
        break;
      } catch (err) {
        lastErr = err;
        pushEvent('send-error', { to: cand, message: err && err.message });
        // If possible, try to query number profile/registration for better error message
        try {
          if (typeof clientInstance.getNumberProfile === 'function') {
            const profile = await clientInstance.getNumberProfile(phone);
            pushEvent('number-profile', { phone, profile });
          } else if (typeof clientInstance.checkNumberStatus === 'function') {
            const status = await clientInstance.checkNumberStatus(phone);
            pushEvent('number-status', { phone, status });
          }
        } catch (e) {
          // ignore
        }
      }
    }

    if (sent) {
      res.json({ ok: true, result: sent });
    } else {
      const msg = (lastErr && lastErr.message) || 'Unknown send error';
      res.status(500).json({ error: msg });
    }
  } catch (err) {
    console.error('Error enviando documento (outer):', err);
    res.status(500).json({ error: err.message || err });
  }
});


// endpoint to send multiple files to multiple numbers
app.post('/send-multiple', upload.array('files'), async (req, res) => {
  if (!clientInstance) return res.status(500).json({ error: 'Cliente no inicializado' });
  if (!clientReady) return res.status(400).json({ error: 'Cliente no listo. Escanea el QR.' });

  const countries = req.body['countries[]'] || req.body.countries || [];
  const numbers = req.body['numbers[]'] || req.body.numbers || [];
  const captions = req.body['captions[]'] || req.body.captions || [];
  const files = req.files || [];

  // Normalize arrays
  const arrCountries = Array.isArray(countries) ? countries : [countries];
  const arrNumbers = Array.isArray(numbers) ? numbers : [numbers];
  const arrCaptions = Array.isArray(captions) ? captions : [captions];
  function safeDecode(s) { try { if (typeof s === 'string') return decodeURIComponent(s); } catch (e) {} return s || ''; }
  const arrCaptionsDecoded = arrCaptions.map(safeDecode);
  const filenames = req.body['filenames[]'] || req.body.filenames || [];
  const arrFilenames = Array.isArray(filenames) ? filenames : [filenames];
  const arrFilenamesDecoded = arrFilenames.map(safeDecode);

  if (arrNumbers.length === 0 || files.length === 0) return res.status(400).json({ error: 'Faltan números o archivos' });
  if (arrNumbers.length !== files.length) {
    // allow if counts mismatch but try to map by index
    pushEvent('warn', 'numbers/files count mismatch');
  }

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const country = arrCountries[i] || arrCountries[0] || '';
    const number = arrNumbers[i] || arrNumbers[0] || '';
    const caption = arrCaptionsDecoded[i] || '';
    const forcedFilename = arrFilenamesDecoded[i] || arrFilenamesDecoded[0] || '';

    if (!country || !number) {
      results.push({ ok: false, error: 'Missing number/country', index: i });
      continue;
    }

    const phone = `${country}${number}`.replace(/[^0-9]/g, '');
    const to = `${phone}@c.us`;

    let sent = null;
    let lastErr = null;
    const candidates = [to, `${phone}@s.whatsapp.net`];
    for (const cand of candidates) {
      try {
        const usedFileName = forcedFilename || file.originalname;
        const r = await clientInstance.sendFile(cand, file.path, usedFileName, caption);
        sent = { to: cand, result: r };
        break;
      } catch (err) {
        lastErr = err;
        pushEvent('send-error', { to: cand, message: err && err.message });
      }
    }

    if (sent) results.push({ ok: true, index: i, to: sent.to, result: sent.result });
    else results.push({ ok: false, index: i, error: (lastErr && lastErr.message) || 'Send failed' });
  }

  res.json({ ok: true, results });
});

// (send-url endpoint removed to revert to original behavior)

const port = process.env.PORT || 3333;
app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));

// Temporary clients map (to allow generating extra QR codes for new sessions)
const tempClients = {};

app.get('/generate-qr', async (req, res) => {
  const sessionName = 'temp-' + Date.now();
  pushEvent('generate-qr-request', sessionName);

  try {
    let responded = false;
    const tmp = await wppconnect.create({
      session: sessionName,
      useChrome: false,
      headless: true,
      logQR: false,
      catchQR: (base64Qr, asciiQR) => {
        if (!responded) {
          responded = true;
          pushEvent('temp-catchQR', { session: sessionName });
          try { res.json({ ok: true, session: sessionName, qr: base64Qr }); } catch (e) {}
          try { if (asciiQR) qrcodeTerm.generate(asciiQR, { small: true }); } catch (e) {}
        }
      },
      puppeteerOptions: { args: ['--no-sandbox', '--disable-setuid-sandbox'] }
    });

    tempClients[sessionName] = tmp;

    // register some basic events for debug
    try { if (typeof tmp.on === 'function') {
      tmp.on('qr', (qr) => pushEvent('temp-qr', { session: sessionName, qr }));
      tmp.on('ready', () => pushEvent('temp-ready', sessionName));
      tmp.on('disconnected', (r) => pushEvent('temp-disconnected', { session: sessionName, r }));
    }} catch (e) {}

    // timeout: if no QR in 45s, respond with error and cleanup
    const to = setTimeout(() => {
      if (responded) return;
      responded = true;
      try { if (typeof tmp.close === 'function') tmp.close(); } catch (e) {}
      delete tempClients[sessionName];
      try { res.status(500).json({ error: 'No QR generated within timeout' }); } catch (e) {}
    }, 45000);

    // schedule cleanup after 10 minutes to avoid orphaning processes
    setTimeout(() => {
      try {
        if (tempClients[sessionName]) {
          try { if (typeof tempClients[sessionName].close === 'function') tempClients[sessionName].close(); } catch (e) {}
          delete tempClients[sessionName];
          pushEvent('temp-cleaned', sessionName);
        }
      } catch (e) {}
    }, 10 * 60 * 1000);

  } catch (err) {
    pushEvent('generate-qr-error', err && err.message);
    res.status(500).json({ error: err && err.message });
  }
});
