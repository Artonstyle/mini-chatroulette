const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const nextBtn = document.getElementById('nextBtn');
const sendBtn = document.getElementById('sendBtn');
const chatInput = document.querySelector('.chat-input input');
const chatMessages = document.querySelector('.chat-messages');

let localStream;
let pc;
const ws = new WebSocket(`wss://${location.host}`);

const configuration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// WebSocket Nachrichten empfangen
ws.onmessage = async (message) => {
  const data = JSON.parse(message.data);

  if (data.type === 'offer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    ws.send(JSON.stringify({ type: 'answer', answer }));
  }

  if (data.type === 'answer') {
    await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
  }

  if (data.type === 'ice') {
    try {
      await pc.addIceCandidate(data.candidate);
    } catch (e) {
      console.error('Fehler bei ICE Candidate:', e);
    }
  }

  if (data.type === 'chat') {
    const msgDiv = document.createElement('div');
    msgDiv.textContent = 'Partner: ' + data.message;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
};

// Starten
startBtn.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  localVideo.srcObject = localStream;

  pc = new RTCPeerConnection(configuration);
  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      ws.send(JSON.stringify({ type: 'ice', candidate: event.candidate }));
    }
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  ws.send(JSON.stringify({ type: 'offer', offer }));
};

// Stoppen
stopBtn.onclick = () => {
  localStream.getTracks().forEach(track => track.stop());
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  pc.close();
};

// Chat senden
sendBtn.onclick = () => {
  const msg = chatInput.value.trim();
  if (!msg) return;

  const msgDiv = document.createElement('div');
  msgDiv.textContent = 'Du: ' + msg;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  chatInput.value = '';

  ws.send(JSON.stringify({ type: 'chat', message: msg }));
};
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') sendBtn.onclick();
});
