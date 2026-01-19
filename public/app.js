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
  statusEl.textContent = 'Iniciando conexión...';
  connectBtn.disabled = true;
  connectBtn.style.opacity = '0.5';
  
  try {
    console.log('🔍 Requesting QR generation...');
    
    // Call /generate-qr to trigger client initialization
    const genRes = await fetch('/generate-qr');
    const genData = await genRes.json();
    console.log('📥 /generate-qr response:', genData);
    
    if (genData.ok && genData.qr) {
      console.log(`✓ QR received immediately: ${genData.qr.length} bytes`);
      displayQr(genData.qr);
      statusEl.textContent = 'Escanea el código QR con WhatsApp';
      connectBtn.style.display = 'none';
    } else if (genData.ready) {
      console.log('✓ Already connected!');
      statusEl.textContent = 'Conexión establecida ✓';
      connectBtn.style.display = 'none';
      isGeneratingQR = false;
    } else {
      console.log('QR not ready yet, starting polling...');
      statusEl.textContent = 'Generando código QR...';
      pollForQR();
    }
  } catch (err) {
    console.error('❌ Error requesting QR:', err);
    statusEl.textContent = 'Error: ' + err.message;
    isGeneratingQR = false;
    connectBtn.disabled = false;
    connectBtn.style.opacity = '1';
  }
}

async function pollForQR() {
  console.log('🔄 Starting QR polling...');
  let attempts = 0;
  const maxAttempts = 120; // ~4 minutes with 2s interval
  
  const pollInterval = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch('/qr');
      const data = await res.json();
      
      if (data.qr && data.qr.startsWith('data:')) {
        console.log(`✓ QR found after ${attempts} attempts (${attempts * 2} seconds)`);
        displayQr(data.qr);
        statusEl.textContent = 'Escanea el código QR con WhatsApp';
        clearInterval(pollInterval);
        isGeneratingQR = false;
      } else if (data.ready) {
        console.log('✓ Connected while polling!');
        statusEl.textContent = 'Conexión establecida ✓';
        clearInterval(pollInterval);
        isGeneratingQR = false;
        connectBtn.style.display = 'none';
      } else if (attempts >= maxAttempts) {
        console.error('❌ QR polling timeout after 4 minutes');
        statusEl.textContent = 'Timeout generando QR. Por favor intenta de nuevo.';
        clearInterval(pollInterval);
        isGeneratingQR = false;
        connectBtn.disabled = false;
        connectBtn.style.opacity = '1';
      } else if (attempts % 10 === 0) {
        console.log(`🔄 Polling... (attempt ${attempts}/${maxAttempts}, ${attempts * 2}s elapsed)`);
        statusEl.textContent = `Generando código QR... (${attempts * 2}s)`;
      }
    } catch (err) {
      console.error('❌ Poll error:', err);
      if (attempts >= maxAttempts) {
        clearInterval(pollInterval);
        statusEl.textContent = 'Error en polling: ' + err.message;
        isGeneratingQR = false;
        connectBtn.disabled = false;
        connectBtn.style.opacity = '1';
      }
    }
  }, 2000); // Poll every 2 seconds
}
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
