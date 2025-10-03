// ACHTUNG: eigene Render-URL anpassen!
const WS_URL = "wss://mini-chatroulette.onrender.com";
const ws = new WebSocket(WS_URL);

let localStream;
let peerConnection;
let dataChannel;

// DOM
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const input = document.getElementById("chatInput");
const sendBtn = document.getElementById("btnSend");
const btnStart = document.getElementById("btnStart");
const btnNext = document.getElementById("btnNext");
const btnStop = document.getElementById("btnStop");
const onlineCountElement = document.getElementById("onlineCount");
const chatBox = document.getElementById("systemMsg");

const config = { 
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" }
  ]
};

const SEARCHING_VIDEO_SRC = "";

// Content-Filter
const bannedWords = ["fuck","sex","nazi","hitler","porn","xxx"];

function addMessage(sender, text, isSystem = false) {
  const div = document.createElement("div");
  div.textContent = `${sender}: ${text}`;
  if (isSystem) {
    div.style.color = "#999";
    div.style.fontStyle = "italic";
  }
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// Kamera
async function startCamera() {
  if (localStream) return true;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video:true, audio:true });
    localVideo.srcObject = localStream;
    return true;
  } catch {
    addMessage("System","❌ Kamera/Mikrofon verweigert.",true);
    return false;
  }
}

function closePeerConnection() {
  if (peerConnection) {
    if (remoteVideo.srcObject) {
      remoteVideo.srcObject.getTracks().forEach(t=>t.stop());
    }
    remoteVideo.srcObject = null;
    peerConnection.close();
    peerConnection = null;
  }
  dataChannel = null;
  addMessage("System","Verbindung beendet.",true);
  btnStart.disabled = false;
  btnNext.disabled = true;
  btnStop.disabled = true;
  sendBtn.disabled = true;
  input.disabled = true;
}

// Verbindung
function createPeerConnection() {
  peerConnection = new RTCPeerConnection(config);
  if (localStream) {
    localStream.getTracks().forEach(track=>peerConnection.addTrack(track,localStream));
  }

  peerConnection.ontrack = e=>{
    remoteVideo.srcObject = e.streams[0];
    addMessage("System","🎥 Partner verbunden.",true);
    btnNext.disabled = false;
    btnStop.disabled = false;
    sendBtn.disabled = false;
    input.disabled = false;
    btnStart.disabled = true;
  };

  peerConnection.onicecandidate = e=>{
    if (e.candidate) {
      ws.send(JSON.stringify({type:"candidate",candidate:e.candidate}));
    }
  };

  dataChannel = peerConnection.createDataChannel("chat");
  dataChannel.onmessage = e=>addMessage("Partner",e.data);

  peerConnection.ondatachannel = ev=>{
    dataChannel = ev.channel;
    dataChannel.onmessage = e=>addMessage("Partner",e.data);
  };

  peerConnection.oniceconnectionstatechange = ()=>{
    if (["disconnected","failed"].includes(peerConnection.iceConnectionState)) {
      closePeerConnection();
    }
  };
}

// WebSocket
ws.onopen = ()=>{
  addMessage("System","✅ Mit Server verbunden.",true);
  btnStart.disabled = false;
  btnStop.disabled = true;
};
ws.onmessage = async e=>{
  const data = JSON.parse(e.data);

  if (data.type==="matched" && data.should_offer) {
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({type:"offer",offer}));

  } else if (data.type==="matched" && !data.should_offer) {
    createPeerConnection();

  } else if (data.type==="offer") {
    if (!peerConnection) createPeerConnection();
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.send(JSON.stringify({type:"answer",answer}));

  } else if (data.type==="answer") {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));

  } else if (data.type==="candidate" && peerConnection) {
    try { await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate)); }
    catch(err){ console.warn("ICE Fehler",err); }

  } else if (data.type==="partner-left") {
    addMessage("System","Partner hat beendet.",true);
    closePeerConnection();

  } else if (data.type==="user-count") {
    onlineCountElement.textContent = data.count;
  }
};

// Buttons
btnStart.onclick = async ()=>{
  if (!await startCamera()) return;
  ws.send(JSON.stringify({type:"start"}));
  addMessage("System","🔎 Suche nach Partner...",true);
  btnStart.disabled = true;
  btnStop.disabled = false;
};
btnNext.onclick = ()=>{
  ws.send(JSON.stringify({type:"next"}));
  closePeerConnection();
  ws.send(JSON.stringify({type:"start"}));
  addMessage("System","🔎 Suche neuer Partner...",true);
  btnNext.disabled = true;
};
btnStop.onclick = ()=>{
  ws.send(JSON.stringify({type:"stop"}));
  if (localStream) {
    localStream.getTracks().forEach(t=>t.stop());
    localStream=null;
    localVideo.srcObject=null;
  }
  closePeerConnection();
  addMessage("System","⏹ Chat gestoppt.",true);
};

sendBtn.onclick = ()=>{
  const text=input.value.trim();
  if (!text) return;
  if (bannedWords.some(w=>text.toLowerCase().includes(w))) {
    addMessage("System","⚠️ Nachricht blockiert.",true);
    input.value="";
    return;
  }
  if (dataChannel && dataChannel.readyState==="open") {
    dataChannel.send(text);
    addMessage("Ich",text);
  }
  input.value="";
};
input.addEventListener("keypress",e=>{
  if (e.key==="Enter"){e.preventDefault();sendBtn.click();}
});}

let localStream = null;
let pc = null;
let peerId = null;
let isInitiator = false;
let iceCandidatesQueue = [];

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};

async function startLocalStream() {
  if (localStream) return localStream;
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
    if (localVideoEl) localVideoEl.srcObject = localStream;
    return localStream;
  } catch (err) {
    console.error('getUserMedia error', err);
    sys('Kamera/Mikrofon Zugriff verweigert oder nicht verfügbar.');
    throw err;
  }
}

function createPeerConnection(remoteSocketId) {
  pc = new RTCPeerConnection(configuration);
  peerId = remoteSocketId;

  pc.onicecandidate = (evt) => {
    if (evt.candidate) {
      socket.emit('signal', { to: peerId, data: { type: 'candidate', candidate: evt.candidate } });
    }
  };

  pc.ontrack = (evt) => {
    if (remoteVideoEl) remoteVideoEl.srcObject = evt.streams[0];
  };

  pc.onconnectionstatechange = () => {
    console.log('pc state', pc.connectionState);
    // optional extra handling could be added here
  };

  if (localStream) {
    for (const t of localStream.getTracks()) {
      pc.addTrack(t, localStream);
    }
  }

  if (iceCandidatesQueue.length > 0) {
    iceCandidatesQueue.forEach(c => {
      try { pc.addIceCandidate(c).catch(e => console.warn('addIceCandidate failed', e)); } catch (e) { console.warn(e); }
    });
    iceCandidatesQueue = [];
  }
}

function closePeerConnection() {
  if (pc) {
    try { pc.close(); } catch (e) {}
    pc = null;
  }
  peerId = null;
  if (remoteVideoEl) remoteVideoEl.srcObject = null;
}

// START
btnStart?.addEventListener('click', async () => {
  try {
    await startLocalStream();
    sys('Kamera gestartet. Verbinde...');
    const profile = getProfile();
    socket.emit('join', profile);
  } catch (e) {
    // handled in startLocalStream
  }
});

// NEXT
btnNext?.addEventListener('click', async () => {
  sys('Nächster wird gesucht...');
  if (peerId) {
    socket.emit('leave');
    closePeerConnection();
  }
  const profile = getProfile();
  socket.emit('next', profile);
});

// STOP
btnStop?.addEventListener('click', () => {
  sys('Verbindung beendet.');
  socket.emit('leave');
  closePeerConnection();
});

// SEND chat
btnSend?.addEventListener('click', () => {
  const txt = chatInput.value.trim();
  if (!txt || !peerId) return;
  socket.emit('chat', { to: peerId, message: txt });
  chatInput.value = '';
});

// socket handlers
socket.on('connect', () => {
  sys('Verbunden mit Signalisierungsserver...');
  showOnlineCount(0);
});

socket.on('onlineCount', (n) => {
  showOnlineCount(n);
});

socket.on('waiting', () => {
  sys('Warte auf Partner...');
});

socket.on('matched', async ({ peerId: otherId, initiator }) => {
  sys('Partner gefunden. Verbinde...');
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
    } catch (err) {
      console.error('offer error', err);
      sys('Fehler beim Erstellen des Angebots.');
    }
  } else {
    // responder waits for offer via 'signal'
  }
});

socket.on('signal', async ({ from, data }) => {
  try {
    if (!pc && data && data.type === 'sdp' && data.sdp && data.sdp.type === 'offer') {
      await startLocalStream().catch(()=>{});
      createPeerConnection(from);
      await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: from, data: { type: 'sdp', sdp: pc.localDescription } });
      return;
    }

    if (!pc && data && data.type === 'candidate') {
      iceCandidatesQueue.push(data.candidate);
      return;
    }

    if (pc) {
      if (data.type === 'sdp') {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
      } else if (data.type === 'candidate') {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.warn('addIceCandidate failed', e);
        }
      }
    }
  } catch (err) {
    console.error('signal handling error', err);
  }
});

socket.on('chat', ({ from, message }) => {
  sys(`Nachricht von Partner: ${message}`);
});

socket.on('peerDisconnected', () => {
  sys('Partner hat die Verbindung beendet.');
  closePeerConnection();
});

socket.on('disconnect', () => {
  sys('Vom Signalisierungsserver getrennt.');
  closePeerConnection();
});    if (isSystem) {
        div.style.color = '#ffc107'; 
        div.style.fontStyle = 'italic';
    }
    // Korrektur: Nutzt die korrekte ID des Nachrichten-Containers
    const chatBox = document.getElementById("systemMsg");
    if (chatBox) {
        chatBox.appendChild(div);
        // Automatisches Scrollen nach unten
        chatBox.scrollTop = chatBox.scrollHeight;
    }
}

// Kamera starten
async function startCamera() {
    if (localStream) return true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        return true;
    } catch (err) {
        addMessage("System", "❌ Fehler beim Zugriff auf Kamera/Mikrofon. Bitte erlauben.", true);
        return false;
    }
}

function closePeerConnection() {
    if (peerConnection) {
        if (remoteVideo.srcObject && remoteVideo.srcObject.getTracks) {
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        }
        remoteVideo.srcObject = null;
        remoteVideo.src = SEARCHING_VIDEO_SRC;
        remoteVideo.loop = true;
        peerConnection.close();
        peerConnection = null;
    }
    dataChannel = null;
    addMessage("System", "Verbindung zum Partner beendet.", true);
    // Korrektur: Buttons richtig disablen/enablen
    btnStart.disabled = false; // Start wieder erlauben
    btnNext.disabled = true;
    btnStop.disabled = false; // Stop muss aktiv bleiben, solange Kamera läuft
    sendBtn.disabled = true;
    input.disabled = true;
    btnReport.disabled = true; // Report disablen
}

function createPeerConnection() {
    //closePeerConnection(); // closePeerConnection wird im 'matched' block aufgerufen.
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = (event) => {
        remoteVideo.src = "";
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.loop = false;
        addMessage("System", "🎥 Videoanruf gestartet!", true);
        // Korrektur: Buttons richtig enablen nach Match
        btnNext.disabled = false;
        btnStop.disabled = false; 
        sendBtn.disabled = false;
        input.disabled = false;
        btnReport.disabled = false;
        btnStart.disabled = true; // Start muss jetzt disablen
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };
    
    // DataChannel
    dataChannel = peerConnection.createDataChannel("chat");
    dataChannel.onopen = () => addMessage("System", "💬 Chat-Kanal geöffnet.", true);
    dataChannel.onmessage = (event) => addMessage("Partner", event.data);

    peerConnection.ondatachannel = (event) => { 
        dataChannel = event.channel;
        dataChannel.onopen = () => addMessage("System", "💬 Chat-Kanal geöffnet.", true);
        dataChannel.onmessage = (e) => addMessage("Partner", e.data);
    };

    peerConnection.oniceconnectionstatechange = () => {
        if (["disconnected", "failed"].includes(peerConnection.iceConnectionState)) {
            addMessage("System", `⚠️ Verbindung getrennt: ${peerConnection.iceConnectionState}`, true);
            closePeerConnection();
        }
    }
}

// --- WebSocket Events ---
ws.onopen = () => {
    addMessage("System", "✅ Verbunden mit Server. Klicke auf Start.", true);
    btnStart.disabled = false;
    btnStop.disabled = true; // Stop sollte erst aktiv sein, wenn Kamera läuft
};

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "matched" && data.should_offer) {
        createPeerConnection();
        addMessage("System", "Partner gefunden. Sende Offer...", true);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer }));

    } else if (data.type === "matched" && !data.should_offer) {
        // Korrektur: createPeerConnection muss hier auch aufgerufen werden
        createPeerConnection(); 
        addMessage("System", "Partner gefunden. Warte auf Offer...", true);

    } else if (data.type === "offer") {
        if (!peerConnection) createPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", answer }));

    } else if (data.type === "answer") {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));

    } else if (data.type === "candidate" && peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.warn("ICE Candidate Fehler:", err);
        }
    } else if (data.type === "partner-left") {
        addMessage("System", "Partner hat beendet.", true);
        closePeerConnection();
    } else if (data.type === "no-match") {
        addMessage("System", "Kein Partner gefunden, wir warten...", true);
    } else if (data.type === "user-count" && onlineCountElement) {
        onlineCountElement.textContent = data.count;
    } else if (data.type === "system") { 
        addMessage("System", data.message, true);
    }
};

// --- Button Events ---
btnStart.onclick = async () => {
    if (!await startCamera()) return; 
    remoteVideo.srcObject = null;
    remoteVideo.src = SEARCHING_VIDEO_SRC;
    remoteVideo.loop = true;
    ws.send(JSON.stringify({ type: "start" }));
    addMessage("System", "🔎 Suche nach Partner...", true);
    btnStart.disabled = true;
    btnStop.disabled = false; // Stop jetzt enablen, da Kamera läuft
};

btnNext.onclick = () => {
    if (peerConnection) {
        ws.send(JSON.stringify({ type: "next" })); 
        closePeerConnection(); 
    }
    // Startet sofort neue Suche
    remoteVideo.srcObject = null;
    remoteVideo.src = SEARCHING_VIDEO_SRC;
    remoteVideo.loop = true;
    ws.send(JSON.stringify({ type: "start" }));
    addMessage("System", "🔎 Suche nach neuem Partner...", true);
    btnNext.disabled = true; // Bis Match gefunden
    btnStart.disabled = true;
    btnReport.disabled = true;
};

btnStop.onclick = () => {
    ws.send(JSON.stringify({ type: "stop" }));
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
        localStream = null;
    }
    closePeerConnection();
    remoteVideo.srcObject = null;
    remoteVideo.src = "";
    remoteVideo.loop = false;
    addMessage("System", "⏹ Chat beendet. Kamera/Mikrofon ausgeschaltet.", true);
    // Korrektur: Buttons zurücksetzen
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnReport.disabled = true;
};

// 🚨 Melden
btnReport.onclick = () => {
    ws.send(JSON.stringify({ type: "report" }));
    addMessage("System", "🚨 Partner gemeldet. Du wirst jetzt getrennt und es wird neu gesucht.", true);
    
    // Automatisch "Next" auslösen nach Report
    if (peerConnection) {
        ws.send(JSON.stringify({ type: "next" })); 
        closePeerConnection(); 
    }
    remoteVideo.srcObject = null;
    remoteVideo.src = SEARCHING_VIDEO_SRC;
    remoteVideo.loop = true;
    ws.send(JSON.stringify({ type: "start" }));
    btnNext.disabled = true;
    btnStart.disabled = true;
    btnReport.disabled = true;
};

// Chat
sendBtn.onclick = () => {
    const text = input.value.trim();
    if (!text) return;

    // 🔎 Content Filter
    if (bannedWords.some(w => text.toLowerCase().includes(w))) {
        addMessage("System", "⚠️ Nachricht blockiert (unangemessen)", true);
        input.value = "";
        return;
    }

    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(text);
        addMessage("Ich", text);
        input.value = "";
    } else {
        addMessage("System", "Chat nicht bereit.", true);
    }
};

// Enter-Taste für Chat
input.addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
        event.preventDefault(); // Verhindert das Hinzufügen einer neuen Zeile
        sendBtn.click();
    }
});


