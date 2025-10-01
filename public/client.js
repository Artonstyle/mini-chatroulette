const socket = new WebSocket(location.origin.replace(/^http/, "ws"));
let pc;

async function start() {
  pc = new RTCPeerConnection();

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
    }
  };

  pc.ontrack = (event) => {
    document.getElementById("remoteVideo").srcObject = event.streams[0];
  };

  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  document.getElementById("localVideo").srcObject = stream;
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  socket.send(JSON.stringify({ type: "start" }));
}

document.getElementById("startBtn").onclick = start;
document.getElementById("stopBtn").onclick = () => socket.send(JSON.stringify({ type: "stop" }));
document.getElementById("nextBtn").onclick = () => socket.send(JSON.stringify({ type: "next" }));

socket.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "matched") {
    if (data.should_offer) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.send(JSON.stringify({ type: "offer", offer }));
    }
  }

  if (data.type === "offer") {
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.send(JSON.stringify({ type: "answer", answer }));
  }

  if (data.type === "answer") {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  if (data.type === "candidate") {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error("❌ Fehler bei ICE:", err);
    }
  }

  if (data.type === "partner-left") {
    console.log("👋 Partner hat verlassen.");
    pc.close();
  }
};// ==== WebSocket Nachrichten ====
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

