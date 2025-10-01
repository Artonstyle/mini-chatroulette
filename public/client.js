// =================================================================
// GLOBALE VARIABLEN (WebSocket, PeerConnection, etc.)
// =================================================================

// ⚠️ WICHTIG: Ersetzen Sie 'localhost:8080' durch die tatsächliche URL/IP Ihres Servers.
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
const onlineCountDisplay = document.getElementById('onlineCount'); // NEU: Zähler-Element

// =================================================================
// WEBSOCKET-FUNKTIONEN
// =================================================================

function connectToServer() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    
    ws = new WebSocket(WS_SERVER_URL);

    ws.onopen = () => {
        console.log('Verbunden mit dem WebSocket-Server.');
        // Kann hier eine initiale Nachricht senden, z.B. um den Zähler zu initiieren
    };

    ws.onmessage = async (event) => {
        const message = JSON.parse(event.data);
        console.log('Nachricht vom Server erhalten:', message.type);

        // NEU: BEHANDLUNG DER ONLINE-ZÄHLER-NACHRICHT
        if (message.type === 'onlineCount') {
            updateOnlineCount(message.count);
        }
        
        // WebRTC Signalisierung (altes Chatroulette-Projekt-Logik)
        if (message.type === 'offer') {
            if (!isStarted) startCall(false);
            peerConnection.setRemoteDescription(new RTCSessionDescription(message));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            ws.send(JSON.stringify(peerConnection.localDescription));
        } else if (message.type === 'answer' && isStarted) {
            peerConnection.setRemoteDescription(new RTCSessionDescription(message));
        } else if (message.type === 'candidate' && isStarted) {
            const candidate = new RTCIceCandidate({
                sdpMid: message.sdpMid,
                sdpMLineIndex: message.sdpMLineIndex,
                candidate: message.candidate
            });
            peerConnection.addIceCandidate(candidate).catch(e => console.error('Error adding received ice candidate:', e));
        } else if (message.type === 'hangup') {
            stopCall();
        }
    };

    ws.onclose = () => {
        console.log('Verbindung zum Server geschlossen. Versuche in 5 Sekunden erneut...');
        // Versuche nach einer Verzögerung die Wiederverbindung
        setTimeout(connectToServer, 5000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket-Fehler:', error);
        ws.close();
    };
}

// =================================================================
// NEU: HILFSFUNKTION FÜR DEN ZÄHLER
// =================================================================

function updateOnlineCount(count) {
    if (onlineCountDisplay) {
        onlineCountDisplay.textContent = count;
    }
}

// =================================================================
// WEBRTC FUNKTIONEN (Kurzfassung)
// =================================================================

async function startCall(isCaller) {
    isStarted = true;
    // ... WebRTC Setup Logik (Media-Zugriff, PeerConnection erstellen, Tracks hinzufügen, Offer/Answer senden) ...
    
    // Beispiel für Media-Zugriff
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
        console.error('Fehler beim Starten des Streams oder Anrufs:', e);
        alert('Konnte nicht auf Kamera und Mikrofon zugreifen. Erlaubnis erteilen!');
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
    console.log('Anruf beendet.');
}

function createPeerConnection() {
    // Hier werden Google's STUN-Server verwendet, um die Verbindung herzustellen
    const configuration = { 
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] 
    };
    peerConnection = new RTCPeerConnection(configuration);

    peerConnection.ontrack = (event) => {
        if (remoteVideo.srcObject !== event.streams[0]) {
            remoteVideo.srcObject = event.streams[0];
            console.log('Remote Stream hinzugefügt.');
        }
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: 'candidate',
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                candidate: event.candidate.candidate
            }));
        }
    };
}


// =================================================================
// EVENT LISTENER
// =================================================================

btnStart.addEventListener('click', () => startCall(true));
btnNext.addEventListener('click', () => {
    // Logik, um den aktuellen Anruf zu beenden und einen neuen zu starten
    if (isStarted) {
        ws.send(JSON.stringify({ type: 'hangup' }));
        stopCall();
    }
    startCall(true); 
});
btnStop.addEventListener('click', () => {
    // Signalisiert dem Partner das Ende und beendet den lokalen Stream
    if (isStarted) {
        ws.send(JSON.stringify({ type: 'hangup' }));
        stopCall();
    }
});


// Starte die Verbindung, wenn die Seite geladen wird
connectToServer();
