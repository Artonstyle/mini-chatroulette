<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WebRTC mit Online-Zähler</title>
<style>
  body { font-family: Arial, sans-serif; text-align: center; margin: 20px; }
  video { width: 45%; border: 1px solid #ccc; margin: 10px; }
  #controls { margin: 20px; }
  #onlineCount { font-weight: bold; }
</style>
</head>
<body>

<h1>WebRTC Video & Online-Zähler</h1>
<p>Online gerade: <span id="onlineCount">0</span></p>

<video id="localVideo" autoplay muted></video>
<video id="remoteVideo" autoplay></video>

<div id="controls">
  <button id="btnStart">Start</button>
  <button id="btnNext">Next</button>
  <button id="btnStop">Stop</button>
</div>

<script>
const WS_SERVER_URL = 'ws://localhost:8080';

let ws;
let localStream;
let peerConnection;
let isStarted = false;

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const btnStart = document.getElementById('btnStart');
const btnNext = document.getElementById('btnNext');
const btnStop = document.getElementById('btnStop');
const onlineCountDisplay = document.getElementById('onlineCount');

// =================== WEBSOCKET ===================

function connectToServer() {
    if (ws && ws.readyState === WebSocket.OPEN) return;

    ws = new WebSocket(WS_SERVER_URL);

    ws.onopen = () => console.log('Verbunden mit WebSocket-Server.');

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        // Online-Zähler aktualisieren
        if (message.type === 'onlineCount') {
            onlineCountDisplay.textContent = message.count;
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
        }
    };

    ws.onclose = () => setTimeout(connectToServer, 5000);
    ws.onerror = (err) => { console.error(err); ws.close(); };
}

connectToServer();

// =================== WEBRTC ===================

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

function createPeerConnection() {
    const config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
    peerConnection = new RTCPeerConnection(config);

    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) ws.send(JSON.stringify({ type: 'candidate', ...event.candidate }));
    };
}

// =================== BUTTONS ===================

btnStart.onclick = () => startCall(true);

btnNext.onclick = async () => {
    if (isStarted) {
        ws.send(JSON.stringify({ type: 'hangup' }));
        stopCall();
    }
    startCall(true);
};

btnStop.onclick = () => {
    if (isStarted) {
        ws.send(JSON.stringify({ type: 'hangup' }));
        stopCall();
    }
};
</script>

</body>
</html>
