// client.js

// ✅ Automatische Wahl zwischen ws:// und wss://
const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
const ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

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

// ✅ Button standardmäßig deaktivieren
sendBtn.disabled = true;

async function initLocalStream() {
  if (localStream) return true;
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
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log("PeerConnection Zustand:", peerConnection.connectionState);
    if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
      addMessage("System", "Verbindung zum Partner verloren.");
      stopConnection();
    }
  };
}

// ✅ Zentrale Funktion fürs DataChannel-Setup
function setupDataChannel(channel) {
  channel.onmessage = (e) => addMessage("Partner", e.data);
  channel.onopen = () => {
    console.log("DataChannel offen ✅");
    sendBtn.disabled = false;
  };
  channel.onclose = () => {
    console.log("DataChannel geschlossen ❌");
    sendBtn.disabled = true;
  };
  peerConnection.dataChannel = channel;
}

// Verbindung sauber stoppen
function stopConnection() {
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
  sendBtn.disabled = true; // Chat wieder deaktivieren
}

startBtn.onclick = async () => {
  if (await initLocalStream()) {
    ws.send(JSON.stringify({ type: "start" }));
  }
};

stopBtn.onclick = () => {
  ws.send(JSON.stringify({ type: "stop" }));
  stopConnection();
};

nextBtn.onclick = () => {
  stopBtn.click();
  setTimeout(() => startBtn.click(), 500);
};

sendBtn.onclick = () => {
  const text = inputField.value.trim();
  if (!text) return;
  addMessage("Du", text);

  if (peerConnection && peerConnection.dataChannel && peerConnection.dataChannel.readyState === "open") {
    peerConnection.dataChannel.send(text);
  }
  inputField.value = "";
};

function addMessage(sender, msg) {
  const div = document.createElement("div");
  div.textContent = `${sender}: ${msg}`;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 🕸️ WebSocket Handling
ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "match") {
    if (!localStream) {
      console.error("Match empfangen, aber localStream fehlt. Breche ab.");
      return;
    }
    createPeerConnection();

    // Offerer → erstellt DataChannel
    const channel = peerConnection.createDataChannel("chat");
    setupDataChannel(channel);

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer }));
  }

  if (data.type === "offer") {
    if (!localStream) {
      console.error("Offer empfangen, aber localStream fehlt. Breche ab.");
      return;
    }
    createPeerConnection();

    // Answerer → wartet auf DataChannel
    peerConnection.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    await peerConnection.setRemoteDescription(data.offer);
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: "answer", answer }));
  }

  if (data.type === "answer") {
    if (peerConnection) {
      await peerConnection.setRemoteDescription(data.answer);
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
