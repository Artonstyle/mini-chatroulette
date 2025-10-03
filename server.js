const http = require("http");
const WebSocket = require("ws");
const express = require("express");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Statische Dateien
app.use(express.static('public'));

let waiting = null;
const pairs = new Map();

// Besucherzahl broadcasten
function broadcastUserCount() {
  const count = wss.clients.size;
  const message = JSON.stringify({ type: "user-count", count });
  wss.clients.forEach(c=>{
    if (c.readyState === WebSocket.OPEN) c.send(message);
  });
}

wss.on("connection",(ws)=>{
  console.log("🔗 Neuer Client");
  broadcastUserCount();

  ws.on("message",(msg)=>{
    const data = JSON.parse(msg);

    if (data.type==="start") {
      if (waiting && waiting!==ws) {
        const caller=ws, answerer=waiting;
        pairs.set(caller,answerer);
        pairs.set(answerer,caller);
        waiting=null;
        caller.send(JSON.stringify({type:"matched",should_offer:true}));
        answerer.send(JSON.stringify({type:"matched",should_offer:false}));
      } else {
        waiting=ws;
        ws.send(JSON.stringify({type:"no-match"}));
      }
    }

    else if (data.type==="next" || data.type==="stop") {
      const partner=pairs.get(ws);
      if (partner) {
        pairs.delete(ws);
        pairs.delete(partner);
        partner.send(JSON.stringify({type:"partner-left"}));
      }
      if (data.type==="stop" && waiting===ws) waiting=null;
    }

    else if (["offer","answer","candidate"].includes(data.type)) {
      const partner=pairs.get(ws);
      if (partner && partner.readyState===WebSocket.OPEN) {
        partner.send(JSON.stringify(data));
      }
    }
  });

  ws.on("close",()=>{
    console.log("🔗 Client getrennt");
    const partner=pairs.get(ws);
    if (partner) {
      pairs.delete(ws);
      pairs.delete(partner);
      if (partner.readyState===WebSocket.OPEN) {
        partner.send(JSON.stringify({type:"partner-left"}));
      }
    }
    if (waiting===ws) waiting=null;
    broadcastUserCount();
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`🚀 Server läuft auf Port ${PORT}`));
// --- Hilfsfunktionen ---
function sys(msg) {
  if (typeof window.setSystemMessage === 'function') {
    window.setSystemMessage(msg);
  } else if (systemMsgEl) {
    systemMsgEl.textContent = msg;
  }
  console.info('[SYS]', msg);
}

function showOnlineCount(n) {
  if (onlineCountEl) onlineCountEl.textContent = n;
}

function appendMessage(text, klass = 'info') {
  if (!messagesEl) return;
  const el = document.createElement('div');
  el.textContent = text;
  el.style.fontSize = '0.9em';
  el.style.padding = '4px 6px';
  el.style.borderRadius = '6px';
  el.style.maxWidth = '75%';
  el.style.wordBreak = 'break-word';
  if (klass === 'me') {
    el.style.background = 'rgba(255,193,7,0.9)';
    el.style.color = '#000';
    el.style.alignSelf = 'flex-end';
  } else if (klass === 'peer') {
    el.style.background = 'rgba(0,123,255,0.9)';
    el.style.color = '#fff';
    el.style.alignSelf = 'flex-start';
  } else {
    el.style.background = 'rgba(100,100,100,0.5)';
    el.style.color = '#fff';
    el.style.alignSelf = 'center';
  }
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function getProfile() {
  const gender = document.getElementById('gender')?.value || '';
  const search = document.getElementById('search')?.value || '';
  const country = document.getElementById('country')?.value || '';
  return { gender, search, country };
}

// --- State ---
let localStream = null;
let pc = null;
let currentPeerId = null;
let isInitiator = false;

// Buffer für ICE Kandidaten pro peerId (Map<string, RTCIceCandidateInit[]>)
const iceCandidatesMap = new Map();

// WebRTC STUN config
const configuration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

// --- Media (start/stop) ---
async function startLocalStream() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
    if (localVideoEl) {
      localVideoEl.srcObject = localStream;
    }
    sys('Kamera/Mikrofon aktiv.');
    return localStream;
  } catch (err) {
    console.error('getUserMedia error', err);
    sys('Fehler: Zugriff auf Kamera/Mikrofon verweigert oder nicht verfügbar.');
    throw err;
  }
}

function stopLocalStream() {
  if (!localStream) return;
  try {
    for (const t of localStream.getTracks()) {
      try { t.stop(); } catch (e) { /* ignore */ }
    }
  } finally {
    localStream = null;
    if (localVideoEl) localVideoEl.srcObject = null;
    sys('Lokale Medien gestoppt.');
  }
}

// --- PeerConnection Management ---
function createPeerConnection(remoteSocketId) {
  // Schließe ggf. bestehende Verbindung vorher sauber
  if (pc) {
    try { pc.close(); } catch (e) {}
    pc = null;
  }

  console.debug('createPeerConnection ->', remoteSocketId);
  pc = new RTCPeerConnection(configuration);
  currentPeerId = remoteSocketId;

  // ICE Kandidaten -> zum Peer senden
  pc.onicecandidate = (evt) => {
    if (evt.candidate) {
      console.debug('onicecandidate -> senden', evt.candidate);
      socket.emit('signal', { to: currentPeerId, data: { type: 'candidate', candidate: evt.candidate } });
    }
  };

  // Remote Track empfangen
  pc.ontrack = (evt) => {
    console.debug('ontrack', evt);
    if (remoteVideoEl) remoteVideoEl.srcObject = evt.streams[0];
  };

  pc.onconnectionstatechange = () => {
    console.info('PC connectionState', pc.connectionState);
    if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      sys('Peer-Verbindung verloren.');
      // leave peer connection; server wird ggf. als getrennt melden
    }
  };

  // Lokale Tracks hinzufügen (wenn vorhanden)
  if (localStream) {
    for (const t of localStream.getTracks()) {
      try {
        pc.addTrack(t, localStream);
      } catch (e) {
        console.warn('addTrack failed', e);
      }
    }
  }

  // Falls bereits Kandidaten für diesen Peer gepuffert sind, hinzufügen
  const buffered = iceCandidatesMap.get(currentPeerId);
  if (buffered && buffered.length) {
    (async () => {
      for (const c of buffered) {
        try {
          await pc.addIceCandidate(c);
          console.debug('Buffered ICE candidate added');
        } catch (err) {
          console.warn('Fehler beim addIceCandidate (buffered):', err);
        }
      }
    })();
    iceCandidatesMap.delete(currentPeerId);
  }

  return pc;
}

async function closePeerConnection() {
  if (pc) {
    try {
      // Entferne lokale Sender-Tracks von der Verbindung (clean teardown)
      try {
        const senders = pc.getSenders ? pc.getSenders() : [];
        for (const s of senders) {
          try { pc.removeTrack(s); } catch (e) { /* ignore */ }
        }
      } catch (e) { /* ignore */ }

      pc.close();
    } catch (e) {
      console.warn('pc.close error', e);
    }
    pc = null;
  }

  // Remote Video zurücksetzen
  if (remoteVideoEl) remoteVideoEl.srcObject = null;

  // Lösche candidate-buffer für aktuellen Peer
  if (currentPeerId) {
    iceCandidatesMap.delete(currentPeerId);
  }

  currentPeerId = null;
  isInitiator = false;
  sys('Peer-Verbindung geschlossen.');
}

// --- Socket.IO Event-Handler & Signalisierung ---
// Reconnect-Strategie (manuell ergänzend; Socket.IO hat selbst reconnect - wir zeigen Status & versuchen Verbindung ggf. neu aufzubauen)
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

socket.on('connect', () => {
  console.info('Socket connected', socket.id);
  sys('Verbunden mit Signalisierungsserver.');
  reconnectAttempts = 0;
});

socket.on('onlineCount', (n) => {
  showOnlineCount(n);
});

socket.on('waiting', () => {
  sys('Warte auf Partner...');
  appendMessage('Warte auf Partner...', 'info');
});

socket.on('matched', async ({ peerId: otherId, initiator }) => {
  console.info('matched with', otherId, 'initiator:', initiator);
  sys('Partner gefunden. Verbinden...');
  appendMessage('Partner gefunden — verbinde...', 'info');
  isInitiator = !!initiator;

  try {
    await startLocalStream();
  } catch (e) {
    return;
  }

  createPeerConnection(otherId);

  if (isInitiator) {
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { to: otherId, data: { type: 'sdp', sdp: pc.localDescription } });
      console.debug('Offer gesendet');
    } catch (err) {
      console.error('Fehler beim Erstellen/Versenden des Offers', err);
      sys('Fehler beim Erstellen des Angebots.');
    }
  } else {
    // Responder wartet auf eingehendes Offer via 'signal'
    console.debug('Responder wartet auf Offer');
  }
});

// Generische Signalisierungsnachrichten (sdp / candidate)
socket.on('signal', async ({ from, data }) => {
  console.debug('signal empfangen von', from, data && data.type);
  if (!data || !from) return;

  try {
    if (data.type === 'sdp' && data.sdp) {
      const sdpType = data.sdp.type;
      if (sdpType === 'offer') {
        // Wenn keine PC existiert, erstellen
        if (!pc) {
          await startLocalStream().catch(e => { throw e; });
          createPeerConnection(from);
        }
        // Set remote offer
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.debug('Remote Offer gesetzt');
        // Antwort erzeugen
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { to: from, data: { type: 'sdp', sdp: pc.localDescription } });
        console.debug('Answer gesendet');
      } else if (sdpType === 'answer') {
        if (!pc) {
          console.warn('Antwort empfangen, aber keine PeerConnection vorhanden');
          return;
        }
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.debug('Remote Answer gesetzt');
      } else {
        console.warn('Unbekannter SDP-Typ', sdpType);
      }
    } else if (data.type === 'candidate' && data.candidate) {
      const cand = data.candidate;
      // Wenn PC existiert, direkt hinzufügen sonst puffer nach peerId
      if (pc && from === currentPeerId) {
        try {
          await pc.addIceCandidate(cand);
          console.debug('ICE candidate hinzugefügt');
        } catch (err) {
          console.warn('addIceCandidate failed', err);
        }
      } else {
        // Pufferer: Kandidaten nach PeerId speichern
        const arr = iceCandidatesMap.get(from) || [];
        arr.push(cand);
        iceCandidatesMap.set(from, arr);
        console.debug('ICE candidate gepuffert für', from);
      }
    } else {
      console.warn('signal: unbekannte data', data);
    }
  } catch (err) {
    console.error('Fehler in signal-handler', err);
  }
});

socket.on('chat', ({ from, message }) => {
  const label = from ? `Remote (${from.slice(0,6)}):` : 'Remote:';
  appendMessage(`${label} ${message}`, 'peer');
});

socket.on('peerDisconnected', () => {
  sys('Gegenstelle hat die Verbindung beendet.');
  appendMessage('Gegenstelle hat die Verbindung beendet.', 'info');
  closePeerConnection();
});

socket.on('disconnect', (reason) => {
  console.warn('Socket disconnected:', reason);
  sys('Verbindung zum Signalisierungsserver unterbrochen. Versuche erneut...');
  // Manuelle reconnect-Logik (zusätzlich zu socket.io internem Mechanismus)
  attemptReconnect();
});

socket.on('connect_error', (err) => {
  console.error('connect_error', err);
  sys('Signalisierungsserver nicht erreichbar.');
  attemptReconnect();
});

// --- Reconnect helper ---
function attemptReconnect() {
  if (reconnectAttempts >= maxReconnectAttempts) {
    sys('Keine Verbindung zum Server möglich. Bitte Seite neu laden.');
    return;
  }
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
  sys(`Reconnect Versuch ${reconnectAttempts}/${maxReconnectAttempts} in ${Math.round(delay/1000)}s...`);
  setTimeout(() => {
    console.debug('Versuche socket.connect() nach', delay);
    try {
      socket.connect();
    } catch (e) {
      console.error('socket.connect() Fehler', e);
    }
  }, delay);
}

// --- UI Aktionen ---
btnStart?.addEventListener('click', async () => {
  try {
    await startLocalStream();
    sys('Kamera gestartet. Suche Partner...');
    appendMessage('Kamera gestartet. Suche Partner...', 'info');
    const profile = getProfile();
    socket.emit('join', profile);
  } catch (e) {
    // Fehler bereits gemeldet
  }
});

btnNext?.addEventListener('click', async () => {
  sys('Nächster Partner wird gesucht...');
  appendMessage('Wechsle zu nächstem Partner...', 'info');
  // Signalisiere dem Server, dass wir wechseln wollen. Server trennt ggf. Peer.
  try {
    socket.emit('next', getProfile());
  } catch (e) {
    console.warn('next emit failed', e);
  }
  // Lokal aufräumen
  closePeerConnection();
});

btnStop?.addEventListener('click', () => {
  sys('Verbindung gestoppt.');
  appendMessage('Verbindung gestoppt.', 'info');
  try {
    socket.emit('leave');
  } catch (e) { /* ignore */ }
  closePeerConnection();
  stopLocalStream();
});

btnSend?.addEventListener('click', () => {
  const txt = chatInput.value?.trim();
  if (!txt) return;
  if (!currentPeerId) {
    appendMessage('Kein Peer verbunden. Nachricht nicht gesendet.', 'info');
    sys('Kein Peer verbunden.');
    return;
  }
  try {
    socket.emit('chat', { to: currentPeerId, message: txt });
    appendMessage(`Du: ${txt}`, 'me');
    chatInput.value = '';
  } catch (e) {
    console.error('chat emit failed', e);
    appendMessage('Fehler beim Senden der Nachricht.', 'info');
  }
});

// Auch Enter im Input drücken soll senden
chatInput?.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    btnSend?.click();
  }
});

// --- Drag & Pinch-to-Zoom für localVideoEl ---
// Nutze transform: translate(tx,ty) scale(s)
(function initLocalVideoTransform() {
  if (!localVideoEl) return;

  let tx = 0, ty = 0, scale = 1;
  let startTx = 0, startTy = 0, startX = 0, startY = 0;
  let activePointerId = null;

  // For touch pinch
  let pinchStartDist = 0;
  let pinchStartScale = 1;
  let lastCenter = null;

  const minScale = 0.6, maxScale = 3;

  // Apply transform
  function applyTransform() {
    localVideoEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  // Clamp position so video stays at least partially visible
  function clampPosition() {
    const rect = localVideoEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Allow some overflow margin
    const margin = 20;
    let left = rect.left;
    let top = rect.top;
    // Calculate expected width/height after scale
    const w = rect.width;
    const h = rect.height;
    // Ensure center remains within viewport (simple)
    if (rect.right < margin) tx += (margin - rect.right);
    if (rect.left > vw - margin) tx -= (rect.left - (vw - margin));
    if (rect.bottom < margin) ty += (margin - rect.bottom);
    if (rect.top > vh - margin) ty -= (rect.top - (vh - margin));
  }

  // Pointer events (mouse and pointer-enabled touch)
  localVideoEl.style.touchAction = 'none'; // wichtig für Touch-Gesten

  localVideoEl.addEventListener('pointerdown', (ev) => {
    if (ev.isPrimary === false) return;
    activePointerId = ev.pointerId;
    startX = ev.clientX;
    startY = ev.clientY;
    startTx = tx;
    startTy = ty;
    localVideoEl.setPointerCapture(activePointerId);
  });

  localVideoEl.addEventListener('pointermove', (ev) => {
    if (activePointerId !== ev.pointerId) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    tx = startTx + dx;
    ty = startTy + dy;
    applyTransform();
  });

  localVideoEl.addEventListener('pointerup', (ev) => {
    if (activePointerId !== ev.pointerId) return;
    localVideoEl.releasePointerCapture(activePointerId);
    activePointerId = null;
    clampPosition();
    applyTransform();
  });

  localVideoEl.addEventListener('pointercancel', (ev) => {
    if (activePointerId !== ev.pointerId) return;
    activePointerId = null;
    clampPosition();
    applyTransform();
  });

  // Touch events for pinch (two-finger)
  localVideoEl.addEventListener('touchstart', (ev) => {
    if (ev.touches.length === 2) {
      ev.preventDefault();
      const t1 = ev.touches[0], t2 = ev.touches[1];
      pinchStartDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      pinchStartScale = scale;
      lastCenter = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
    } else if (ev.touches.length === 1) {
      // start single touch drag
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
      startTx = tx;
      startTy = ty;
    }
  }, { passive: false });

  localVideoEl.addEventListener('touchmove', (ev) => {
    if (ev.touches.length === 2) {
      ev.preventDefault();
      const t1 = ev.touches[0], t2 = ev.touches[1];
      const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const center = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
      if (pinchStartDist > 0) {
        const factor = dist / pinchStartDist;
        scale = Math.min(maxScale, Math.max(minScale, pinchStartScale * factor));
      }
      // Optional: adjust translation so pinch center remains roughly fixed (simple)
      if (lastCenter) {
        const dx = center.x - lastCenter.x;
        const dy = center.y - lastCenter.y;
        tx += dx;
        ty += dy;
        lastCenter = center;
      }
      applyTransform();
    } else if (ev.touches.length === 1) {
      const dx = ev.touches[0].clientX - startX;
      const dy = ev.touches[0].clientY - startY;
      tx = startTx + dx;
      ty = startTy + dy;
      applyTransform();
    }
  }, { passive: false });

  localVideoEl.addEventListener('touchend', (ev) => {
    if (ev.touches.length < 2) {
      // reset pinch start values
      pinchStartDist = 0;
      lastCenter = null;
    }
    clampPosition();
    applyTransform();
  });

  // Reset-Button (klein) um Transform zurückzusetzen
  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset';
  resetBtn.title = 'Local video zurücksetzen';
  Object.assign(resetBtn.style, {
    position: 'fixed',
    right: '12px',
    bottom: '150px',
    zIndex: 9999,
    padding: '6px 8px',
    borderRadius: '6px',
    border: 'none',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '0.8em'
  });
  resetBtn.addEventListener('click', () => {
    tx = 0; ty = 0; scale = 1;
    applyTransform();
  });
  document.body.appendChild(resetBtn);

  // Initial transform
  applyTransform();

  // Responsiveness: clamp after window resize
  window.addEventListener('resize', () => {
    clampPosition();
    applyTransform();
  });
})();

// --- Cleanup on unload (Browser tab close) ---
window.addEventListener('beforeunload', () => {
  try {
    socket.emit('leave');
  } catch (e) {}
  closePeerConnection();
  stopLocalStream();
});

// End of client.js}

function tryMatch(waitingEntry) {
  for (let i = 0; i < waiting.length; i++) {
    const other = waiting[i];
    if (other.socketId === waitingEntry.socketId) continue;
    if (isCompatible(waitingEntry, other)) {
      const idxA = waiting.findIndex(w => w.socketId === waitingEntry.socketId);
      const idxB = waiting.findIndex(w => w.socketId === other.socketId);
      const high = Math.max(idxA, idxB), low = Math.min(idxA, idxB);
      if (high >= 0) waiting.splice(high, 1);
      if (low >= 0) waiting.splice(low, 1);

      pairs.set(waitingEntry.socketId, other.socketId);
      pairs.set(other.socketId, waitingEntry.socketId);

      const initiator = Math.random() < 0.5 ? waitingEntry.socketId : other.socketId;
      const responder = initiator === waitingEntry.socketId ? other.socketId : waitingEntry.socketId;

      io.to(initiator).emit('matched', { peerId: responder, initiator: true });
      io.to(responder).emit('matched', { peerId: initiator, initiator: false });

      return true;
    }
  }
  return false;
}

io.on('connection', (socket) => {
  console.log('conn:', socket.id);
  updateOnlineCount();

  socket.on('join', (profile) => {
    console.log('join from', socket.id, profile);
    const prevIdx = waiting.findIndex(w => w.socketId === socket.id);
    if (prevIdx >= 0) waiting.splice(prevIdx, 1);
    waiting.push({ socketId: socket.id, profile });
    const entry = waiting.find(w => w.socketId === socket.id);
    if (!tryMatch(entry)) {
      io.to(socket.id).emit('waiting');
    }
  });

  socket.on('leave', () => {
    console.log('leave', socket.id);
    const peer = pairs.get(socket.id);
    if (peer) {
      pairs.delete(peer);
      pairs.delete(socket.id);
      io.to(peer).emit('peerDisconnected');
    }
    const idx = waiting.findIndex(w => w.socketId === socket.id);
    if (idx >= 0) waiting.splice(idx, 1);
    updateOnlineCount();
  });

  socket.on('next', (profile) => {
    console.log('next from', socket.id);
    const currentPeer = pairs.get(socket.id);
    if (currentPeer) {
      pairs.delete(currentPeer);
      pairs.delete(socket.id);
      io.to(currentPeer).emit('peerDisconnected');
    }
    const oldIdx = waiting.findIndex(w => w.socketId === socket.id);
    if (oldIdx >= 0) waiting.splice(oldIdx, 1);
    waiting.push({ socketId: socket.id, profile });
    const entry = waiting.find(w => w.socketId === socket.id);
    if (!tryMatch(entry)) {
      io.to(socket.id).emit('waiting');
    }
    updateOnlineCount();
  });

  socket.on('signal', ({ to, data }) => {
    if (!to) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('chat', ({ to, message }) => {
    if (!to || !message) return;
    io.to(to).emit('chat', { from: socket.id, message });
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    const idx = waiting.findIndex(w => w.socketId === socket.id);
    if (idx >= 0) waiting.splice(idx, 1);
    const peer = pairs.get(socket.id);
    if (peer) {
      pairs.delete(peer);
      pairs.delete(socket.id);
      io.to(peer).emit('peerDisconnected');
    }
    updateOnlineCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});


