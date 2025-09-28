const ws = new WebSocket("wss://mini-chatroulette.onrender.com"); // Render-Server

let localStream;
let peerConnection;
let dataChannel;

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const messagesDiv = document.querySelector(".chat-messages");
const input = document.querySelector(".chat-input input");
const sendBtn = document.querySelector(".btn-send");

const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

async function startCamera() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  // Lokale Tracks hinzufügen
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // Remote Stream anzeigen
  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  // ICE-Kandidaten senden
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
    }
  };

  // DataChannel für Chat
  dataChannel = peerConnection.createDataChannel("chat");
  dataChannel.onmessage = (event) => addMessage("Partner", event.data);

  peerConnection.ondatachannel = (event) => {
    event.channel.onmessage = (e) => addMessage("Partner", e.data);
  };
}

function addMessage(sender, text) {
  const div = document.createElement("div");
  div.textContent = `${sender}: ${text}`;
  messagesDiv.appendChild(div);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// --- WebSocket Events ---
ws.onopen = () => console.log("✅ Verbunden mit Render-Server");

ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "match") {
    console.log("🎉 Partner gefunden, erstelle Angebot...");
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer }));
  } else if (data.type === "offer") {
    createPeerConnection();
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
      console.error("❌ Fehler bei Candidate:", err);
    }
  } else if (data.type === "partner-left") {
    remoteVideo.srcObject = null;
    console.log("❌ Dein Partner hat verlassen.");
  }
};

// --- Buttons ---
document.querySelector(".btn-start").onclick = async () => {
  await startCamera();
  ws.send(JSON.stringify({ type: "start" }));
};

document.querySelector(".btn-next").onclick = () => {
  ws.send(JSON.stringify({ type: "next" }));
};

document.querySelector(".btn-stop").onclick = () => {
  ws.send(JSON.stringify({ type: "stop" }));
};

sendBtn.onclick = () => {
  const text = input.value.trim();
  if (text && dataChannel) {
    dataChannel.send(text);
    addMessage("Ich", text);
    input.value = "";
  }
};
