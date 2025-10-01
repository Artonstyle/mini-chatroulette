// client.js
const ws = new WebSocket(`wss://${window.location.host}`);
let localStream;
let peerConnection;
const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

const startBtn = document.querySelector(".btn-start");
const stopBtn = document.querySelector(".btn-stop");
const nextBtn = document.querySelector(".btn-next");
const sendBtn = document.querySelector(".btn-send");
const inputField = document.querySelector(".chat-input input");
const chatMessages = document.querySelector(".chat-messages");

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

async function initLocalStream() {
  if (localStream) return true; // Stream ist bereits da
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    return true;
  } catch (err) {
    console.error("Kamera/Mikrofon Fehler:", err);
    alert("Fehler beim Zugriff auf Kamera und Mikrofon: " + err.name);
    return false;
  }
}

function createPeerConnection() {
  if (!localStream) {
    console.error("PeerConnection kann nicht erstellt werden: localStream fehlt.");
    return;
  }
  
  peerConnection = new RTCPeerConnection(config);

  localStream.getTracks().forEach((track) => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    // Stellt sicher, dass das Video nur gesetzt wird, wenn es noch nicht gesetzt wurde
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
    }
  };
  
  // Füge onconnectionstatechange für bessere Fehlerbehandlung hinzu
  peerConnection.onconnectionstatechange = () => {
    console.log('PeerConnection Zustand:', peerConnection.connectionState);
    if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
      addMessage("System", "Verbindung zum Partner verloren.");
      stopConnection(); // Rufe eine Funktion zum Beenden auf
    }
  };
}

// Neue Funktion, um das Stoppen zu zentralisieren
function stopConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  // Optional: localStream stoppen, um Kamera freizugeben
  // if (localStream) {
  //   localStream.getTracks().forEach(track => track.stop());
  //   localStream = null;
  //   localVideo.srcObject = null;
  // }
}


startBtn.onclick = async () => {
  if (await initLocalStream()) { // Warten, bis der Stream bereit ist
    ws.send(JSON.stringify({ type: "start" }));
  }
};

stopBtn.onclick = () => {
  ws.send(JSON.stringify({ type: "stop" }));
  stopConnection();
};

nextBtn.onclick = () => {
  stopBtn.onclick();
  // Eine kleine Pause ist gut, aber man sollte nicht warten, 
  // bis die "stop"-Nachricht verarbeitet wurde. 500ms sind okay.
  setTimeout(() => {
    startBtn.onclick();
  }, 500);
};

sendBtn.onclick = () => {
  const text = inputField.value.trim();
  if (!text) return;
  addMessage("Du", text);

  // Stelle sicher, dass dataChannel vorhanden und bereit zum Senden ist
  if (peerConnection && peerConnection.dataChannel && peerConnection.dataChannel.readyState === 'open') {
    peerConnection.dataChannel.send(text);
  } else {
    addMessage("System", "Chat-Kanal ist noch nicht bereit.");
  }
  inputField.value = "";
};

function addMessage(sender, msg) {
  const div = document.createElement("div");
  div.textContent = `${sender}: ${msg}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---
## 🕸️ WebSocket Handling

ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "match") {
    if (!localStream) { // Überprüfung für den Fall, dass start gesendet wurde, aber localStream fehlschlug
        console.error("Match empfangen, aber localStream fehlt. Breche ab.");
        return;
    }
    createPeerConnection();

    // Ersteller des Kanals (Offerer)
    const channel = peerConnection.createDataChannel("chat");
    channel.onmessage = (e) => addMessage("Partner", e.data);
    peerConnection.dataChannel = channel; // Speichern für sendBtn.onclick

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer }));
  }

  if (data.type === "offer") {
    if (!localStream) { // Überprüfung für den Fall, dass localStream fehlschlug
        console.error("Offer empfangen, aber localStream fehlt. Breche ab.");
        return;
    }
    createPeerConnection();

    // Empfänger des Kanals (Answerer)
    peerConnection.ondatachannel = (event) => {
      event.channel.onmessage = (e) => addMessage("Partner", e.data);
      peerConnection.dataChannel = event.channel; // Speichern für sendBtn.onclick
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: "answer", answer }));
  }

  if (data.type === "answer") {
    if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    }
  }

  if (data.type === "candidate") {
    if (peerConnection) {
        try {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (err) {
            console.error("Fehler beim ICE Candidate:", err);
        }
    }
  }

  if (data.type === "stop") {
    stopConnection();
    addMessage("System", "Der Partner hat die Verbindung beendet.");
  }
};

// **Init Kamera beim Laden entfernt, da es jetzt im startBtn.onclick liegt.** // Dadurch hat der Nutzer mehr Kontrolle und der Stream wird erst 
// beim Startversuch angefordert.
