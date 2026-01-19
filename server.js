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

// Clear session if DELETE_SESSION env var is set
if (process.env.DELETE_SESSION === 'true') {
  const sessionPath = path.join(__dirname, 'tokens', 'whatsapp-doc-sender');
  if (fs.existsSync(sessionPath)) {
    console.log('🗑️  Deleting old session folder...');
    fs.rmSync(sessionPath, { recursive: true, force: true });
    console.log('✓ Session deleted. Will create fresh session.');
  }
}

let clientInstance = null;
let clientReady = false;
let lastQr = null;
let lastState = null;
const lastEvents = [];
let isInitializingClient = false;  // Flag to prevent concurrent client initialization
let currentSessionName = null;     // Tracks the active session folder in /tokens
const tokensDir = path.join(__dirname, 'tokens');

function pushEvent(name, data) {
  const item = { name, data, time: new Date().toISOString() };
  lastEvents.push(item);
  if (lastEvents.length > 80) lastEvents.shift();
  console.log(name, data || '');
}

async function cleanupSession(reason) {
  pushEvent('session-cleanup', { reason, session: currentSessionName });
  try {
    if (clientInstance && typeof clientInstance.close === 'function') {
      await clientInstance.close();
    }
  } catch (e) {
    console.warn('cleanupSession close error:', e.message);
  }

  clientInstance = null;
  clientReady = false;
  lastQr = null;
  lastState = null;

  if (currentSessionName) {
    const sessionPath = path.join(tokensDir, currentSessionName);
    try {
      await fs.promises.rm(sessionPath, { recursive: true, force: true });
      pushEvent('session-removed', sessionPath);
    } catch (e) {
      console.warn('cleanupSession rm error:', e.message);
    }
  }
}

// Function to create client (called on-demand when user clicks "Connect")
async function createClientWithFallback(baseSession) {
  const baseOptions = {
    session: baseSession,
    useChrome: false,
    headless: true,
    logQR: false,                           // Disable verbose QR logging
    qrTimeout: 0,                          // No QR timeout (wait indefinitely for scan)
    autoClose: 9999999,                    // Very large timeout instead of 0 (v1.37.9 bug workaround)
    catchQR: (base64Qr, asciiQR) => {
      console.log('🔔 catchQR CALLED with:', { type: typeof base64Qr, length: base64Qr ? base64Qr.length : 0 });
      pushEvent('catchQR-fired', 'QR callback invoked');
      // Validate QR before storing
      if (base64Qr && typeof base64Qr === 'string' && base64Qr.startsWith('data:')) {
        lastQr = base64Qr;
        const size = (base64Qr.length / 1024).toFixed(2);
        pushEvent('catchQR', { session: baseSession, qr: true, sizeKB: size });
        console.log(`✓ QR captured: ${size} KB`);
      } else {
        console.warn('⚠ Invalid QR format:', typeof base64Qr, base64Qr ? base64Qr.slice(0, 50) : 'null');
        pushEvent('catchQR-invalid', { session: baseSession, type: typeof base64Qr });
      }
      try {
        if (asciiQR) qrcodeTerm.generate(asciiQR, { small: true });
      } catch (e) {
        console.error('ASCII QR error:', e.message);
      }
    },
    puppeteerOptions: {
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',        // Reduce memory usage
        '--disable-gpu',                   // Disable GPU
        '--single-process',                // Run in single process (less memory)
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-default-apps',
        '--disable-preconnect',
        '--disable-blink-features=AutomationControlled',  // Hide Puppeteer
        '--disable-web-security'           // Allow script injection (for wapi.js)
      ],
      // Disable page navigation that interrupts script injection
      ignoreHTTPSErrors: true,
      // Increase timeout for stable page state
      timeout: 60000
    }
  };

  try {
    currentSessionName = baseSession;
    return await wppconnect.create(baseOptions);
  } catch (err) {
    pushEvent('create-error', err && err.message);
    const errMsg = (err && typeof err.message === 'string') ? err.message : '';
    
    // Retry on navigation/execution context errors (they're usually temporary)
    if (errMsg.includes('already running')) {
      const alt = baseSession + '-' + Date.now();
      pushEvent('trying-fallback-session', alt);
      const altOptions = Object.assign({}, baseOptions, { session: alt });
      currentSessionName = alt;
      return await wppconnect.create(altOptions);
    }
    
    // Retry on execution context destroyed (navigation race condition)
    if (errMsg.includes('Execution context was destroyed') || errMsg.includes('navigation')) {
      pushEvent('retry-after-navigation-error', { attempt: 1 });
      await new Promise(r => setTimeout(r, 3000)); // Wait 3s before retry
      try {
        return await wppconnect.create(baseOptions);
      } catch (retryErr) {
        pushEvent('retry-failed', retryErr && retryErr.message);
        throw retryErr;
      }
    }
    
    throw err;
  }
}

async function initializeClient() {
  if (clientInstance) {
    console.log('✓ Client already initialized');
    return clientInstance;
  }
  
  if (isInitializingClient) {
    console.log('⏳ Client initialization already in progress...');
    // Wait for initialization to complete
    while (isInitializingClient && !clientInstance) {
      await new Promise(r => setTimeout(r, 500));
    }
    return clientInstance;
  }
  
  isInitializingClient = true;
  console.log('🚀 Initializing WhatsApp client...');
  
  try {
    const client = await createClientWithFallback('whatsapp-doc-sender');
    clientInstance = client;
    if (!currentSessionName) currentSessionName = 'whatsapp-doc-sender';

    // Wait a moment for the page to stabilize before attaching listeners
    await new Promise(r => setTimeout(r, 2000));

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
    
    // Add extra debugging for QR capture
    console.log('🔍 Client methods:', Object.keys(client || {}).filter(k => k.includes('qr') || k.includes('QR')));
    console.log('🔍 Client has onQR:', typeof client.onQR);
    console.log('🔍 Client has on:', typeof client.on);

    const handlers = {
      qr: (qr) => { 
        console.log('🔔 qr event FIRED with:', { type: typeof qr, length: qr ? qr.length : 0 });
        lastQr = qr; 
        pushEvent('qr-event', qr); 
      },
      ready: () => { clientReady = true; pushEvent('ready'); },
      authenticated: (session) => pushEvent('authenticated', session),
      auth_success: () => { clientReady = true; pushEvent('auth_success'); },
      auth_failure: (msg) => { clientReady = false; pushEvent('auth_failure', msg); cleanupSession('auth_failure'); },
      disconnected: (reason) => { clientReady = false; pushEvent('disconnected', reason); cleanupSession('disconnected'); },
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
            cleanupSession('state-change-close');
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
    
    return client;
  } catch (e) {
    console.error('❌ Fallo iniciando wppconnect:', e);
    throw e;
  } finally {
    isInitializingClient = false;
  }
}

// Serve the static web UI and parse JSON bodies
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/status', (req, res) => {
  const lastEvent = lastEvents.length ? lastEvents[lastEvents.length - 1] : null;
  res.json({ ready: clientReady, lastState, lastQr: !!lastQr, lastEvent });
});
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
const host = process.env.HOST || '0.0.0.0';
app.listen(port, host, () => {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || (`http://localhost:${port}`);
  console.log(`Server listening on ${baseUrl} (bound to ${host}:${port})`);
});

let isGeneratingQR = false;  // Flag to prevent concurrent QR requests

app.get('/generate-qr', async (req, res) => {
  console.log('📥 /generate-qr called');
  // If already connected/logged, just report ready without starting QR flow
  if (clientReady || (clientInstance && (clientInstance.isLogged || clientInstance.connected))) {
    pushEvent('generate-qr-skip', 'already-connected');
    return res.json({ ok: true, ready: true, message: 'Already connected' });
  }

  // Check if we already have a cached QR from the main client
  if (lastQr && lastQr.startsWith('data:')) {
    console.log('✓ Returning cached QR from main client');
    return res.json({ ok: true, session: 'main', qr: lastQr, source: 'cached' });
  }
  
  // Avoid concurrent QR generations; wait for the current one to finish
  if (isGeneratingQR) {
    pushEvent('generate-qr-blocked', 'Already waiting for QR');
    // Wait up to 10s for ongoing generation to finish
    let waited = 0;
    while (isGeneratingQR && waited < 10000) {
      await new Promise(r => setTimeout(r, 200));
      waited += 200;
    }
    if (lastQr && lastQr.startsWith('data:')) {
      return res.json({ ok: true, session: 'main', qr: lastQr, source: 'cached-after-wait' });
    }
    if (isGeneratingQR) return res.status(429).json({ error: 'QR request already in progress' });
  }
  
  pushEvent('generate-qr-request', 'initializing-client');
  isGeneratingQR = true;
  
  try {
    // Initialize the client if it doesn't exist
    console.log('🔍 Initializing client (if needed)...');
    await initializeClient();
    // If initialization set us as ready, return early
    if (clientReady || (clientInstance && (clientInstance.isLogged || clientInstance.connected))) {
      pushEvent('generate-qr-skip', 'connected-after-init');
      return res.json({ ok: true, ready: true, message: 'Already connected' });
    }
    
    console.log('🔍 Client initialized, waiting for QR...');
    console.log('🔍 Client instance exists:', !!clientInstance);
    console.log('🔍 Current lastQr:', lastQr ? `${lastQr.length} bytes` : 'null');

    // Try to get QR from client directly if it has a getQrCode method
    if (clientInstance && typeof clientInstance.getQrCode === 'function') {
      try {
        console.log('🔍 Attempting to call clientInstance.getQrCode()...');
        const qrFromClient = await clientInstance.getQrCode();
        if (qrFromClient && typeof qrFromClient === 'string' && qrFromClient.startsWith('data:')) {
          lastQr = qrFromClient;
          console.log('✓ Got QR directly from client:', qrFromClient.length, 'bytes');
          return res.json({ ok: true, session: 'main', qr: qrFromClient, source: 'client-method' });
        } else if (qrFromClient) {
          console.log('⚠ getQrCode returned unexpected data');
        }
      } catch (e) {
        console.warn('Failed to get QR from client method:', e.message);
      }
    }
    
    // Wait up to 30 seconds for the main client to capture a QR via catchQR callback
    let attempts = 0;
    const maxAttempts = 60;  // 30 seconds with 500ms interval
    
    console.log('🔍 Polling lastQr for up to 30 seconds...');
    while (attempts < maxAttempts && !lastQr) {
      await new Promise(r => setTimeout(r, 500));
      attempts++;
      
      // After 15 seconds, try to take a screenshot and extract QR
      if (attempts === 30 && !lastQr && clientInstance) {
        console.log('⏱️  Timeout after 15s, attempting screenshot fallback...');
        try {
          // Try to get screenshot of the page
          const screenshot = await clientInstance.page?.screenshot({ encoding: 'base64' });
          if (screenshot) {
            // For now, just save it as lastQr so we can see if page is loading
            console.log('📷 Screenshot captured:', screenshot.length, 'bytes');
            pushEvent('screenshot-fallback', { size: screenshot.length });
            // Note: We would need qr-reader library to decode QR from image
            // For now, this is just to verify the page is accessible
          }
        } catch (e) {
          console.warn('Failed to take screenshot:', e.message);
        }
      }
      
      if (attempts % 10 === 0) {
        console.log(`🔍 Still waiting... (${attempts * 0.5}s elapsed, lastQr=${lastQr ? 'exists' : 'null'})`);
      }
    }
    
    if (lastQr && lastQr.startsWith('data:')) {
      const size = (lastQr.length / 1024).toFixed(2);
      pushEvent('generate-qr-success', { source: 'main-client', sizeKB: size });
      console.log(`✓ Returning main client QR: ${size} KB`);
      return res.json({ ok: true, session: 'main', qr: lastQr, source: 'main-client' });
    } else {
      console.error('❌ Timeout: QR not captured after 30s. lastQr:', lastQr ? lastQr.slice(0, 100) : 'null');
      console.error('⚠️  Possible causes: catchQR callback not fired, page not loaded, or WhatsApp Web not accessible');
      pushEvent('generate-qr-timeout', 'main client QR not available after 30s');
      
      // Try to provide useful error message
      const clientInfo = {
        instanceExists: !!clientInstance,
        hasPage: !!clientInstance?.page,
        hasGetQrCode: typeof clientInstance?.getQrCode === 'function'
      };
      console.error('Client debug info:', clientInfo);
      
      return res.status(500).json({ 
        error: 'QR not available from main client after 30s', 
        debug: clientInfo,
        hint: 'Check server logs - catchQR callback may not be firing'
      });
    }
  } catch (err) {
    console.error('❌ Error in /generate-qr:', err);
    pushEvent('generate-qr-error', err && err.message);
    res.status(500).json({ error: err && err.message });
  } finally {
    isGeneratingQR = false;
  }
});

// Manual logout endpoint to clear session and tokens
app.post('/logout', async (req, res) => {
  try {
    await cleanupSession('manual-logout');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
