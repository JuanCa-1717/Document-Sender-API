const statusEl = document.getElementById('status');
const qrEl = document.getElementById('qr');
const qrHelpEl = document.getElementById('qr-help');
let qrRenderer = null;
let prevReady = null;
let lastEventSeenTime = null;
let isGeneratingQR = false;  // Flag to prevent concurrent QR generation
let qrGenerationAttempted = false;  // Flag to only try once

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
      setTimeout(() => { statusEl.textContent = 'Esperando QR / Conexión'; }, 3000);
      if (qrHelpEl) qrHelpEl.style.display = '';
    } else {
      statusEl.textContent = effectiveReady ? 'Conexión establecida' : 'Esperando QR / Conexión';
    }

    if (effectiveReady) {
      if (qrEl) qrEl.innerHTML = '';
      if (qrHelpEl) qrHelpEl.style.display = 'none';
    } else {
      if (qrHelpEl) qrHelpEl.style.display = '';
    }
    prevReady = effectiveReady;
    return data.ready;
  } catch (e) {
    statusEl.textContent = 'Error conectando al servidor';
    return false;
  }
}

async function fetchQr() {
  try {
    const res = await fetch('/qr');
    const data = await res.json();
    
    // If no QR in cache, try to generate one (but only once and not concurrently)
    if (!data.qr && data.status === 'waiting') {
      if (isGeneratingQR || qrGenerationAttempted) {
        // Already generating or already tried, just wait
        return;
      }
      
      console.log('No QR in cache, generating fresh QR...');
      isGeneratingQR = true;
      qrGenerationAttempted = true;
      
      try {
        const genRes = await fetch('/generate-qr');
        const genData = await genRes.json();
        if (genData.ok && genData.qr) {
          console.log(`✓ QR received: ${genData.qr.length} bytes`);
          displayQr(genData.qr);
        }
      } catch (e) {
        console.warn('Failed to generate QR:', e);
        // Allow retry after 30 seconds on failure
        setTimeout(() => { qrGenerationAttempted = false; }, 30000);
      } finally {
        isGeneratingQR = false;
      }
      return;
    }
    
    // Display cached QR
    if (data.qr) {
      console.log(`✓ QR from cache: ${data.qr.length} bytes`);
      displayQr(data.qr);
      // Reset generation flag since we have a valid QR now
      qrGenerationAttempted = false;
    } else {
      qrEl.innerHTML = '';
    }
  } catch (e) {
    console.warn('No QR disponible yet', e);
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
  await fetchStatus();
  await fetchQr();
  setInterval(fetchStatus, 3000);
  setInterval(fetchQr, 3000);
}

init();
