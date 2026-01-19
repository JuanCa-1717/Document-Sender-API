const statusEl = document.getElementById('status');
const qrEl = document.getElementById('qr');
const qrHelpEl = document.getElementById('qr-help');
const connectBtn = document.getElementById('connectBtn');
let qrRenderer = null;
let prevReady = null;
let lastEventSeenTime = null;
let isGeneratingQR = false;  // Flag to prevent concurrent QR generation
let qrGenerationAttempted = false;  // Flag to only try once
let hasConnected = false;  // Flag to track if user already connected

function isDisconnectHint(lastEvent, lastState) {
  try {
    if (!lastEvent && !lastState) return false;
    if (lastEvent && lastEvent.name) {
      const n = String(lastEvent.name).toLowerCase();
      if (n.includes('discon') || n.includes('auth_failure') || n.includes('auth_fail')) return true;
    }
    if (lastEvent && lastEvent.data) {
      const d = JSON.stringify(lastEvent.data).toLowerCase();
      if (d.includes('disconnect') || d.includes('closed') || d.includes('close')) return true;
    }
    if (lastState) {
      const s = (typeof lastState === 'string') ? lastState.toLowerCase() : JSON.stringify(lastState).toLowerCase();
      if (s.includes('close') || s.includes('disconnect') || s.includes('conflict') || s.includes('unpaired')) return true;
    }
  } catch (e) {}
  return false;
}

async function fetchStatus() {
  try {
    const res = await fetch('/status');
    const data = await res.json();
    // determine effective readiness using server hints and recent events
    let effectiveReady = !!data.ready;
    const hint = isDisconnectHint(data.lastEvent, data.lastState);
    if (hint) effectiveReady = false;

    // also use timestamps: if lastEvent is recent and indicates disconnect, prefer disconnected
    if (data.lastEvent && data.lastEvent.time) {
      lastEventSeenTime = new Date(data.lastEvent.time).getTime();
      const age = Date.now() - lastEventSeenTime;
      if (age < 30 * 1000 && isDisconnectHint(data.lastEvent, data.lastState)) {
        effectiveReady = false;
      }
    }

    // handle visible transitions
    if (prevReady === true && effectiveReady === false) {
      statusEl.textContent = 'Desconectado';
      connectBtn.style.display = '';
      qrEl.innerHTML = '';
      setTimeout(() => { statusEl.textContent = 'Presiona "Conectar WhatsApp" para escanear QR'; }, 3000);
      if (qrHelpEl) qrHelpEl.style.display = '';
    } else {
      statusEl.textContent = effectiveReady ? 'Conexión establecida ✓' : (hasConnected ? 'Esperando escaneo de QR...' : 'Presiona "Conectar WhatsApp" para comenzar');
    }

    if (effectiveReady) {
      if (qrEl) qrEl.innerHTML = '';
      if (qrHelpEl) qrHelpEl.style.display = 'none';
      connectBtn.style.display = 'none';  // Hide button when connected
      hasConnected = false;
    }
    
    prevReady = effectiveReady;
    return data.ready;
  } catch (e) {
    statusEl.textContent = 'Error conectando al servidor';
    return false;
  }
}

async function requestQR() {
  if (isGeneratingQR) {
    console.log('Already requesting QR...');
    return;
  }
  
  hasConnected = true;
  isGeneratingQR = true;
  statusEl.textContent = 'Solicitando código QR...';
  connectBtn.disabled = true;
  connectBtn.style.opacity = '0.5';
  
  try {
    console.log('Calling /generate-qr...');
    const genRes = await fetch('/generate-qr');
    console.log('Response status:', genRes.status);
    const genData = await genRes.json();
    console.log('Response data:', genData);
    
    if (genData.ok && genData.qr) {
      console.log(`✓ QR received: ${genData.qr.length} bytes`);
      displayQr(genData.qr);
      statusEl.textContent = 'Escanea el código QR con WhatsApp';
      connectBtn.style.display = 'none';
    } else {
      console.error('No QR in response:', genData);
      statusEl.textContent = 'Error: ' + (genData.error || 'No se pudo generar el QR') + '. Intenta nuevamente.';
      connectBtn.disabled = false;
      connectBtn.style.opacity = '1';
    }
  } catch (e) {
    console.error('Failed to request QR:', e);
    statusEl.textContent = 'Error al solicitar QR. Intenta nuevamente.';
    connectBtn.disabled = false;
    connectBtn.style.opacity = '1';
  } finally {
    isGeneratingQR = false;
  }
}

function displayQr(qrData) {
  qrEl.innerHTML = '';
  if (typeof qrData === 'string' && qrData.startsWith('data:')) {
    const img = document.createElement('img');
    img.src = qrData;
    img.style.width = '350px';
    img.style.height = '350px';
    img.style.border = '1px solid #ccc';
    img.style.padding = '10px';
    qrEl.appendChild(img);
  } else {
    qrRenderer = new QRCode(qrEl, { text: qrData, width: 350, height: 350 });
  }
}
async function init() {
  // Setup connect button click handler
  connectBtn.addEventListener('click', requestQR);
  
  // Check initial status only
  await fetchStatus();
  
  // Only poll status to detect connection state (no auto QR requests)
  setInterval(fetchStatus, 5000);
}

init();
