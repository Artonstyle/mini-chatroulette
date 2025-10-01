// =================================================================
// client.js
// =================================================================

// ⚠️ WICHTIG: Ersetzen Sie DIESEN PLATZHALTER durch Ihre echte Render-URL!
// Beispiel: "wss://mein-cooles-chatroulette.onrender.com"
const WS_URL = "wss://mini-chatroulette.onrender.com"; // HIER URL EINFÜGEN
const ws = new WebSocket(WS_URL); 

let localStream;
let peerConnection;
let dataChannel;

// DOM-Elemente
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const messagesDiv = document.querySelector(".chat-messages");
const input = document.getElementById("chatInput");
const sendBtn = document.getElementById("btnSend");
const btnStart = document.querySelector(".btn-start");
const btnNext = document.querySelector(".btn-next");
const btnStop = document.querySelector(".btn-stop");
const onlineCountElement = document.getElementById("onlineCount");
const systemMsg = document.getElementById("systemMsg");


const config = { 
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
    ] 
};

// Platzhalter für "Suchen"-Animation (Muss existieren!)
const SEARCHING_VIDEO_SRC = "/assets/searching.mp4"; 

// --- Hilfsfunktionen ---

function updateSystemMessage(message, color = '#ffc107') {
    if (systemMsg) {
        systemMsg.innerText = message;
        systemMsg.style.color = color;
    }
}

function addMessage(sender, text, isSystem = false) {
    const div = document.createElement("div");
    div.textContent = `${sender}: ${text}`;
    if (isSystem) {
        div.style.color = '#ffc107'; 
        div.style.fontStyle = 'italic';
    }
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function startCamera() {
    if (localStream) return true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        return true;
    } catch (err) {
        updateSystemMessage("❌ Fehler beim Zugriff auf Kamera/Mikrofon. Erlaubnis erteilen!", '#f00');
        return false;
    }
}

function closePeerConnection() {
    if (peerConnection) {
        if (remoteVideo.srcObject && remoteVideo.srcObject.getTracks) {
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        }
        remoteVideo.srcObject = null;
        remoteVideo.src = SEARCHING_VIDEO_SRC;
        remoteVideo.loop = true; 
        peerConnection.close();
        peerConnection = null;
    }
    dataChannel = null;
    addMessage("System", "Verbindung zum Partner beendet.", true);
    btnNext.disabled = true;
    sendBtn.disabled = true;
    input.disabled = true;
}

function createPeerConnection() {
    closePeerConnection(); 
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    // Remote-Stream empfangen
    peerConnection.ontrack = (event) => {
        remoteVideo.src = ""; 
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.loop = false;
        addMessage("System", "🎥 Videoanruf gestartet!", true);
        updateSystemMessage("📢 Partner verbunden!", '#007bff');
        btnNext.disabled = false;
        sendBtn.disabled = false;
        input.disabled = false;
    };

    // ICE-Kandidaten senden
    peerConnection.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };
    
    // DataChannel für Chat (vom CALLER erstellt)
    dataChannel = peerConnection.createDataChannel("chat");
    dataChannel.onopen = () => addMessage("System", "💬 Chat-Kanal geöffnet.", true);
    dataChannel.onmessage = (event) => addMessage("Partner", event.data);

    // DataChannel EMPFANGEN (vom ANSWERER empfangen)
    peerConnection.ondatachannel = (event) => { 
        dataChannel = event.channel;
        dataChannel.onopen = () => addMessage("System", "💬 Chat-Kanal geöffnet.", true);
        dataChannel.onmessage = (e) => addMessage("Partner", e.data);
    };

    peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
            addMessage("System", `⚠️ Verbindung getrennt: ${peerConnection.iceConnectionState}`, true);
            closePeerConnection();
        }
    }
}


// --- WebSocket Events ---
ws.onopen = () => {
    updateSystemMessage("✅ Verbunden mit Signalisierungsserver. Klicken Sie auf Start.", '#0f0');
    btnStart.disabled = false;
    btnStop.disabled = false;
};

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    // NEU: Logik für Besucherzählung
    if (data.type === "user-count") {
        if (onlineCountElement) {
            onlineCountElement.textContent = data.count;
        }
    } 
    
    // NEU: Logik für Partner-Matching
    else if (data.type === "matched" && data.should_offer) {
        // CALLER: Erstelle Offer
        createPeerConnection();
        updateSystemMessage("Partner gefunden. Starte Videoanruf (Offer)...", '#ffc107');
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer }));

    } else if (data.type === "matched" && !data.should_offer) {
        // ANSWERER: Partner gefunden, warte auf Offer
        updateSystemMessage("Partner gefunden. Warte auf Videoanruf (Offer)...", '#ffc107');

    } else if (data.type === "offer") {
        // ANSWERER: Empfange Offer
        if (!peerConnection) createPeerConnection();
        
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
            console.warn("Fehler beim Hinzufügen des ICE Candidate:", err);
        }
    } else if (data.type === "partner-left") {
        updateSystemMessage("Ihr Partner hat die Verbindung getrennt. Suche neu.", '#f00');
        closePeerConnection();
        // Hier könnte man direkt die Suche neu starten: document.querySelector(".btn-next").onclick();

    } else if (data.type === "no-match") {
        updateSystemMessage("Kein passender Partner gefunden. Wir warten weiter...", '#ffc107');
    } 
};

ws.onclose = () => {
    updateSystemMessage("❌ Verbindung zum Server getrennt.", '#f00');
    console.log("WebSocket-Verbindung getrennt.");
    btnStart.disabled = true;
    btnStop.disabled = true;
};
ws.onerror = (error) => {
    updateSystemMessage("❌ WebSocket-Fehler!", '#f00');
    console.error("WebSocket Fehler:", error);
};


// --- Buttons mit Logik ---

btnStart.onclick = async () => {
    if (!await startCamera()) return; 

    closePeerConnection(); // Beende alte Verbindung falls vorhanden
    
    updateSystemMessage("🔍 Suche nach Partner...", '#ffc107');
    
    ws.send(JSON.stringify({ type: "start" }));
    btnStart.disabled = true;
};

btnNext.onclick = () => {
    if (ws.readyState !== WebSocket.OPEN) {
        updateSystemMessage("❌ Server nicht verbunden.", '#f00');
        return;
    }
    ws.send(JSON.stringify({ type: "next" }));
    closePeerConnection();
    updateSystemMessage("🔍 Suche nach neuem Partner...", '#ffc107');
    btnNext.disabled = true;
};

btnStop.onclick = () => {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop" }));
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
        localStream = null;
    }
    
    closePeerConnection();
    remoteVideo.src = ""; 
    remoteVideo.loop = false;
    addMessage("System", "Chat beendet. Kamera ausgeschaltet.", true);
    updateSystemMessage("✅ Verbunden mit Server. Klicken Sie auf Start.", '#0f0');
    btnStart.disabled = false;
};

// Chat-Nachricht senden
sendBtn.onclick = () => {
    const text = input.value.trim();
    if (text && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(text);
        addMessage("Ich", text);
        input.value = "";
    } else if (text) {
         addMessage("System", "Chat-Kanal ist noch nicht bereit (Partner nicht verbunden).", true);
    }
};
