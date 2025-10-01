// ==== WebSocket-Verbindung zum Server ====
const socket = new WebSocket(`ws://${window.location.hostname}:3000`);

// ==== WebRTC Variablen ====
let localStream;
let pc; // RTCPeerConnection
let partnerConnected = false;

// ==== UI-Elemente holen ====
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const startBtn = document.querySelector(".btn-start");
const nextBtn = document.querySelector(".btn-next");
const stopBtn = document.querySelector(".btn-stop");
const chatInput = document.querySelector(".chat-input input");
const sendBtn = document.querySelector(".btn-send");
const chatMessages = document.querySelector(".chat-messages");

// ==== Button Events ====
startBtn.addEventListener("click", () => {
  console.log("▶️ Suche gestartet...");
  socket.send(JSON.stringify({ type: "start" }));
});

nextBtn.addEventListener("click", () => {
  console.log("⏭ Nächster angefordert");
  socket.send(JSON.stringify({ type: "next" }));
});

stopBtn.addEventListener("click", () => {
  console.log("⏹ Stop gedrückt");
  socket.send(JSON.stringify({ type: "stop" }));
  closeConnection();
});

// ==== Chat senden ====
sendBtn.addEventListener("click", () => {
  const msg = chatInput.value.trim();
  if (msg && partnerConnected) {
    chatMessages.innerHTML += `<div><b>Du:</b> ${msg}</div>`;
    socket.send(JSON.stringify({ type: "chat", message: msg }));
    chatInput.value = "";
  }
});

// ==== WebSocket Nachrichten ====
socket.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  console.log("📩 Nachricht:", data);

  if (data.type === "no-match") {
    console.log("⚠️ Kein Partner gefunden, warte...");
  }

  if (data.type === "matched") {
    console.log("✅ Partner gefunden");
    partnerConnected = true;
    await startVideo();

    createPeerConnection();

    if (data.should_offer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.send(JSON.stringify({ type: "offer", sdp: offer }));
    }
  }

  if (data.type === "offer") {
    createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.send(JSON.stringify({ type: "answer", sdp: answer }));
  }

  if (data.type === "answer") {
    await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
  }

  if (data.type === "candidate") {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error("ICE Fehler", err);
    }
  }

  if (data.type === "partner-left") {
    console.log("❌ Partner hat verlassen");
    partnerConnected = false;
    closeConnection();
  }

  if (data.type === "chat") {
    chatMessages.innerHTML += `<div><b>Partner:</b> ${data.message}</div>`;
  }
};

// ==== Video starten ====
async function startVideo() {
  if (!localStream) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localVideo.srcObject = localStream;
    } catch (err) {
      console.error("🎥 Kamera/Mikrofon Fehler:", err);
    }
  }
}

// ==== Verbindung erstellen ====
function createPeerConnection() {
  pc = new RTCPeerConnection();

  // Lokale Tracks hinzufügen
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  // Remote Stream empfangen
  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // ICE-Kandidaten senden
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
    }
  };
}

// ==== Verbindung schließen ====
function closeConnection() {
  if (pc) {
    pc.close();
    pc = null;
  }
  remoteVideo.srcObject = null;
  partnerConnected = false;
}
