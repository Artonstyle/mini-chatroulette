// ===================== WebSocket =====================
const WS_SERVER_URL = 'ws://localhost:8080';
let ws;
let localStream;
let peerConnection;
let isStarted = false;

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const btnStart = document.querySelector('.btn-start');
const btnNext = document.querySelector('.btn-next');
const btnStop = document.querySelector('.btn-stop');

const onlineCountDisplay = document.getElementById('onlineCount');

const chatMessages = document.querySelector('.chat-messages');
const chatInput = document.querySelector('.chat-input input');
const btnSend = document.querySelector('.btn-send');

// ===================== Funktionen =====================

// Online-Zähler aktualisieren
function updateOnlineCount(count) {
    if (onlineCountDisplay) onlineCountDisplay.textContent = count;
}

// WebSocket verbinden
function connectToServer() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(WS_SERVER_URL);

    ws.onopen = () => console.log('Verbunden mit WebSocket-Server.');

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);

        // Live Online-Zähler
        if (message.type === 'onlineCount') {
            updateOnlineCount(message.count);
        }

        // WebRTC Signalisierung
        if (message.type === 'offer') {
            if (!isStarted) await startCall(false);
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            ws.send(JSON.stringify(peerConnection.localDescription));
        } else if (message.type === 'answer' && isStarted) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(message));
        } else if (message.type === 'candidate' && isStarted) {
            const candidate = new RTCIceCandidate(message);
            await peerConnection.addIceCandidate(candidate);
        } else if (message.type === 'hangup') {
            stopCall();
        } else if (message.type === 'chat') {
            appendChatMessage(message.text, 'remote');
        }
    };

    ws.onclose = () => setTimeout(connectToServer, 5000);
    ws.onerror = (err) => { console.error(err); ws.close(); };
}

// ===================== WebRTC =====================
async function startCall(isCaller) {
    isStarted = true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;

        createPeerConnection();
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

        if (isCaller) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            ws.send(JSON.stringify(peerConnection.localDescription));
        }
    } catch (e) {
        console.error('Fehler beim Zugriff auf Kamera/Mikrofon:', e);
        alert('Bitte Kamera & Mikrofon erlauben!');
    }
}

function stopCall() {
    isStarted = false;
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
}

// PeerConnection erstellen
function createPeerConnection() {
    const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    peerConnection = new RTCPeerConnection(config);

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: 'candidate', ...event.candidate }));
        }
    };
}

// ===================== Buttons =====================
btnStart.addEventListener('click', () => startCall(true));

btnNext.addEventListener('click', async () => {
    if (isStarted) {
        ws.send(JSON.stringify({ type: 'hangup' }));
        stopCall();
    }
    startCall(true);
});

btnStop.addEventListener('click', () => {
    if (isStarted) {
        ws.send(JSON.stringify({ type: 'hangup' }));
        stopCall();
    }
});

// ===================== Chat =====================
function appendChatMessage(text, sender) {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.padding = '5px 10px';
    div.style.marginBottom = '5px';
    div.style.borderRadius = '5px';
    div.style.backgroundColor = sender === 'me' ? '#28a745' : '#007bff';
    div.style.color = '#fff';
    div.style.alignSelf = sender === 'me' ? 'flex-end' : 'flex-start';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

btnSend.addEventListener('click', () => {
    const text = chatInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    appendChatMessage(text, 'me');
    ws.send(JSON.stringify({ type: 'chat', text }));
    chatInput.value = '';
});

// Enter-Taste zum Senden
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') btnSend.click();
});

// ===================== Verbindung starten =====================
connectToServer();
