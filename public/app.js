const statusEl = document.getElementById('status');
const qrEl = document.getElementById('qr');
const qrHelpEl = document.getElementById('qr-help');
let qrRenderer = null;
let prevReady = null;
let lastEventSeenTime = null;

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
    if (data.qr) {
      qrEl.innerHTML = '';
      if (typeof data.qr === 'string' && data.qr.startsWith('data:')) {
        const img = document.createElement('img');
        img.src = data.qr;
        img.style.width = '260px';
        img.style.height = '260px';
        qrEl.appendChild(img);
      } else {
        qrRenderer = new QRCode(qrEl, { text: data.qr, width: 260, height: 260 });
      }
    } else {
      qrEl.innerHTML = '';
    }
  } catch (e) {
    console.warn('No QR disponible yet');
  }
}
async function init() {
  await fetchStatus();
  await fetchQr();
  setInterval(fetchStatus, 3000);
  setInterval(fetchQr, 3000);
}

init();
