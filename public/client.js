// Elemente aus HTML
const startBtn = document.querySelector('.btn-start');
const stopBtn = document.querySelector('.btn-stop');
const nextBtn = document.querySelector('.btn-next');
const sendBtn = document.querySelector('.btn-send');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const chatMessages = document.querySelector('.chat-messages');
const chatInput = document.querySelector('.chat-input input');

let localStream;
let peerConnection;
let dataChannel;
let ws;

// Starte WebSocket + PeerConnection
function connectWS() {
  ws = new WebSocket(`wss://${window.location.host}`);
  
  ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'offer') {
      await handleOffer(data.offer);
    } else if (data.type === 'answer') {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } else if (data.type === 'candidate') {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    }
  };

  ws.onopen = () => console.log("WebSocket verbunden ✅");
  ws.onerror = (err) => console.error("WebSocket Fehler:", err);
}

// Webcam starten + Peer erstellen
async function startWebcam() {
  connectWS();
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  createPeerConnection();

  // Track hinzufügen
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  // DataChannel für Chat
  dataChannel = peerConnection.createDataChannel("chat");
  setupDataChannel();

  // Offer erstellen
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'offer', offer }));
}

// PeerConnection erstellen
function createPeerConnection() {
  peerConnection = new RTCPeerConnection();

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: 'candidate', candidate: event.candidate }));
    }
  };

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.ondatachannel = (event) => {
    dataChannel = event.channel;
    setupDataChannel();
  };
}

// Offer vom Partner empfangen + Answer senden
async function handleOffer(offer) {
  createPeerConnection();
  await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

  // Eigene Kamera
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;
  localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);
  ws.send(JSON.stringify({ type: 'answer', answer }));
}

// Chat DataChannel
function setupDataChannel() {
  if (!dataChannel) return;

  dataChannel.onmessage = (event) => {
    const div = document.createElement('div');
    div.textContent = "Partner: " + event.data;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  };
}

// Nachricht senden
function sendMessage() {
  const msg = chatInput.value.trim();
  if (!msg || !dataChannel) return;

  dataChannel.send(msg);

  const div = document.createElement('div');
  div.textContent = "Du: " + msg;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  chatInput.value = '';
}

// Webcam + Verbindung stoppen
function stopAll() {
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  chatMessages.innerHTML = '';
  chatInput.value = '';
  if (peerConnection) peerConnection.close();
  if (ws) ws.close();
}

startBtn.addEventListener('click', startWebcam);
stopBtn.addEventListener('click', stopAll);
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

// Optional: Nächster Benutzer (Reload/Reset für Demo)
nextBtn.addEventListener('click', () => { stopAll(); startWebcam(); });
