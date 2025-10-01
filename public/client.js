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
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.error("Kamera/Mikrofon Fehler:", err);
  }
}

function createPeerConnection() {
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
}

startBtn.onclick = async () => {
  ws.send(JSON.stringify({ type: "start" }));
};

stopBtn.onclick = () => {
  ws.send(JSON.stringify({ type: "stop" }));
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  remoteVideo.srcObject = null;
};

nextBtn.onclick = () => {
  stopBtn.onclick();
  setTimeout(() => {
    startBtn.onclick();
  }, 500);
};

sendBtn.onclick = () => {
  const text = inputField.value.trim();
  if (!text) return;
  addMessage("Du", text);

  if (peerConnection && peerConnection.dataChannel) {
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

// WebSocket Handling
ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "match") {
    createPeerConnection();

    const channel = peerConnection.createDataChannel("chat");
    channel.onmessage = (e) => addMessage("Partner", e.data);
    peerConnection.dataChannel = channel;

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer }));
  }

  if (data.type === "offer") {
    createPeerConnection();

    peerConnection.ondatachannel = (event) => {
      event.channel.onmessage = (e) => addMessage("Partner", e.data);
      peerConnection.dataChannel = event.channel;
    };

    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: "answer", answer }));
  }

  if (data.type === "answer") {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  if (data.type === "candidate") {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (err) {
      console.error("Fehler beim ICE Candidate:", err);
    }
  }

  if (data.type === "stop") {
    if (peerConnection) peerConnection.close();
    peerConnection = null;
    remoteVideo.srcObject = null;
    addMessage("System", "Der Partner hat die Verbindung beendet.");
  }
};

// Init Kamera beim Laden
initLocalStream();
