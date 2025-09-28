// Konfigurieren Sie hier die URL Ihres Signalisierungsservers
const WS_URL = "wss://mini-chatroulette.onrender.com"; 
const ws = new WebSocket(WS_URL); 

let localStream;
let peerConnection;
let dataChannel;
let isCaller = false; // Wird vom Server festgelegt

// DOM-Elemente
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const messagesDiv = document.querySelector(".chat-messages");
const input = document.querySelector(".chat-input input");
const sendBtn = document.querySelector(".btn-send");
const startBtn = document.querySelector(".btn-start");
const nextBtn = document.querySelector(".btn-next");
const stopBtn = document.querySelector(".btn-stop");

const config = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

// --- Hilfsfunktionen ---

function addMessage(sender, text, isSystem = false) {
    const div = document.createElement("div");
    div.textContent = `${sender}: ${text}`;
    if (isSystem) {
        div.style.color = '#ffc107'; // Gelb für Systemnachrichten
        div.style.fontStyle = 'italic';
    }
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateButtons(isStarted, isConnected = false) {
    startBtn.disabled = isStarted;
    nextBtn.disabled = !isConnected;
    stopBtn.disabled = !isStarted;
    sendBtn.disabled = !isConnected;
    input.disabled = !isConnected;
}

async function startCamera() {
    if (localStream) return; // Stream ist bereits aktiv
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        localVideo.srcObject = localStream;
        return true;
    } catch (err) {
        addMessage("System", "❌ Fehler beim Zugriff auf Kamera/Mikrofon. Bitte erlauben Sie den Zugriff.", true);
        return false;
    }
}

function closePeerConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        remoteVideo.srcObject = null;
    }
    dataChannel = null;
    isCaller = false;
    addMessage("System", "Verbindung zum Partner beendet.", true);
    updateButtons(true, false);
}

function createPeerConnection() {
    // Falls eine alte Verbindung existiert, zuerst schließen
    closePeerConnection(); 

    peerConnection = new RTCPeerConnection(config);

    // Lokalen Stream anhängen
    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    // Remote-Stream empfangen
    peerConnection.ontrack = (event) => {
        remoteVideo.srcObject = event.streams[0];
        addMessage("System", "🎥 Videoanruf gestartet!", true);
        updateButtons(true, true); // Jetzt verbunden!
    };

    // ICE-Kandidaten senden
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };
    
    // DataChannel für Chat (für den Anrufer)
    dataChannel = peerConnection.createDataChannel("chat");
    dataChannel.onopen = () => addMessage("System", "💬 Chat-Kanal geöffnet.", true);
    dataChannel.onmessage = (event) => addMessage("Partner", event.data);

    // DataChannel für Chat (für den Empfänger)
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        dataChannel.onopen = () => addMessage("System", "💬 Chat-Kanal geöffnet.", true);
        dataChannel.onmessage = (e) => addMessage("Partner", e.data);
    };

    peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
            addMessage("System", `⚠️ Verbindung getrennt: ${peerConnection.iceConnectionState}`, true);
            closePeerConnection();
            updateButtons(true, false);
        }
    }
}

// --- WebSocket Handling ---
ws.onopen = () => {
    addMessage("System", "✅ Verbunden mit Signalisierungsserver. Klicken Sie auf Start.", true);
    updateButtons(false, false);
};
ws.onclose = () => {
    addMessage("System", "🛑 Verbindung zum Server getrennt.", true);
    closePeerConnection();
    updateButtons(false, false);
};
ws.onerror = (err) => {
    addMessage("System", `❌ WebSocket-Fehler: ${err.message}`, true);
};


ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "matched" && data.should_offer) {
        // Der Server hat einen Partner gefunden. Wir sind der Anrufer (Caller).
        isCaller = true;
        createPeerConnection();
        addMessage("System", "Partner gefunden. Starte Videoanruf...", true);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer }));

    } else if (data.type === "offer") {
        // Wir sind der Empfänger (Answerer).
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
            console.error("❌ Fehler beim Hinzufügen des ICE Candidate:", err);
        }
        
    } else if (data.type === "partner_left") {
        addMessage("System", "Ihr Partner hat die Verbindung getrennt.", true);
        closePeerConnection();
    } else if (data.type === "no_match") {
        addMessage("System", "Kein passender Partner gefunden. Wir warten weiter...", true);
    }
};

// --- Buttons ---

// Startet die Suche und Kamerazugriff
startBtn.onclick = async () => {
    if (!await startCamera()) return; // Nur fortfahren, wenn Kamera erfolgreich gestartet wurde
    
    const gender = document.getElementById("gender").value;
    const search = document.getElementById("search").value;
    const country = document.getElementById("country").value;

    ws.send(JSON.stringify({ 
        type: "join", 
        gender: gender, 
        search: search, 
        country: country 
    }));
    
    addMessage("System", "Suche nach passendem Partner...", true);
    updateButtons(true, false);
};

// Startet die Suche neu
nextBtn.onclick = () => {
    // 1. Verbindung sauber beenden (für Peer und Server)
    if (peerConnection) {
        ws.send(JSON.stringify({ type: "next" })); // Server informieren
        closePeerConnection(); 
    }
    
    // 2. Neue Suche starten
    const gender = document.getElementById("gender").value;
    const search = document.getElementById("search").value;
    const country = document.getElementById("country").value;

    ws.send(JSON.stringify({ 
        type: "join", // Server soll neuen Match starten
        gender: gender, 
        search: search, 
        country: country 
    }));
    
    addMessage("System", "Suche nach neuem Partner...", true);
    updateButtons(true, false);
};

// Stoppt die Verbindung und die Suche
stopBtn.onclick = () => {
    // Server über das Verlassen informieren
    ws.send(JSON.stringify({ type: "stop" }));
    
    // Lokalen Stream beenden
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
        localStream = null;
    }
    
    closePeerConnection();
    addMessage("System", "Chat beendet. Klicken Sie auf Start für einen neuen Versuch.", true);
    updateButtons(false, false);
};

// Chat-Nachricht senden
sendBtn.onclick = () => {
    const text = input.value.trim();
    if (text && dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(text);
        addMessage("Ich", text);
        input.value = "";
    } else if (text) {
         addMessage("System", "Chat-Kanal ist noch nicht bereit.", true);
    }
};
