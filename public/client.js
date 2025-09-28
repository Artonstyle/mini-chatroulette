// Konfigurieren Sie hier die URL Ihres Signalisierungsservers
const WS_URL = "wss://mini-chatroulette.onrender.com"; 
const ws = new WebSocket(WS_URL); 

let localStream;
let peerConnection;
let dataChannel;

// DOM-Elemente (Werte aus dem HTML)
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const messagesDiv = document.querySelector(".chat-messages");
const input = document.querySelector(".chat-input input");
const sendBtn = document.querySelector(".btn-send");

// Selektoren für die Suchkriterien
const genderSelect = document.getElementById("gender");
const searchSelect = document.getElementById("search");
const countrySelect = document.getElementById("country");

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

async function startCamera() {
    if (localStream) return true;
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
        // Schließe alle Tracks auf der Remote-Seite, um Speicher freizugeben
        if (remoteVideo.srcObject) {
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            remoteVideo.srcObject = null;
        }
        peerConnection.close();
        peerConnection = null;
    }
    dataChannel = null;
    addMessage("System", "Verbindung zum Partner beendet.", true);
    document.querySelector(".btn-next").disabled = true;
    document.querySelector(".btn-send").disabled = true;
    input.disabled = true;
}

function createPeerConnection() {
    // Falls eine alte Verbindung existiert, zuerst sauber schließen
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
        document.querySelector(".btn-next").disabled = false;
        document.querySelector(".btn-send").disabled = false;
        input.disabled = false;
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
    peerConnection.ondatachanel = (event) => {
        dataChannel = event.channel;
        dataChannel.onopen = () => addMessage("System", "💬 Chat-Kanal geöffnet.", true);
        dataChannel.onmessage = (e) => addMessage("Partner", e.data);
    };

    // Überwachung des Verbindungsstatus
    peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'disconnected' || peerConnection.iceConnectionState === 'failed') {
            addMessage("System", `⚠️ Verbindung getrennt: ${peerConnection.iceConnectionState}`, true);
            closePeerConnection();
        }
    }
}


// --- WebSocket Events ---
ws.onopen = () => {
    addMessage("System", "✅ Verbunden mit Signalisierungsserver. Klicken Sie auf Start.", true);
    document.querySelector(".btn-start").disabled = false;
    document.querySelector(".btn-stop").disabled = false;
};

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "matched" && data.should_offer) {
        // Server sagt: Starte die Verbindung (DU bist der Caller)
        createPeerConnection();
        addMessage("System", "Partner gefunden. Starte Videoanruf (Offer)...", true);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer }));

    } else if (data.type === "offer") {
        // Server sagt: Antworte auf ein Angebot (DU bist der Answerer)
        createPeerConnection();
        addMessage("System", "Partner gefunden. Empfange Offer...", true);
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
             // Dies passiert oft, wenn der Peer die Verbindung bereits geschlossen hat
             console.warn("Fehler beim Hinzufügen des ICE Candidate (wahrscheinlich normal):", err);
        }
    } else if (data.type === "partner_left") {
        addMessage("System", "Ihr Partner hat die Verbindung getrennt.", true);
        closePeerConnection();
    } else if (data.type === "no_match") {
         addMessage("System", "Kein passender Partner gefunden. Wir warten weiter...", true);
    }
};

// --- Buttons mit Matchmaking-Logik ---

document.querySelector(".btn-start").onclick = async () => {
    if (!await startCamera()) return; // Kamera starten und bei Fehler abbrechen
    
    // Kriterien sammeln
    const gender = genderSelect.value;
    const search = searchSelect.value;
    const country = countrySelect.value;

    // Sende Kriterien an den Server, um einen Match zu finden
    ws.send(JSON.stringify({ 
        type: "join", 
        gender: gender, 
        search: search, 
        country: country 
    }));
    
    addMessage("System", `Suche nach Partner (Ich: ${gender}, Suche: ${search}, Land: ${country})...`, true);
    document.querySelector(".btn-start").disabled = true;
};

document.querySelector(".btn-next").onclick = () => {
    // 1. Aktuelle Verbindung sauber beenden
    if (peerConnection) {
        ws.send(JSON.stringify({ type: "next" })); // Server informieren
        closePeerConnection(); 
    }
    
    // 2. Neue Suche mit aktuellen Kriterien starten
    const gender = genderSelect.value;
    const search = searchSelect.value;
    const country = countrySelect.value;

    ws.send(JSON.stringify({ 
        type: "join", // Verwende "join" erneut, um in die Warteschlange zu gelangen
        gender: gender, 
        search: search, 
        country: country 
    }));
    
    addMessage("System", "Suche nach neuem Partner...", true);
    document.querySelector(".btn-next").disabled = true;
};

document.querySelector(".btn-stop").onclick = () => {
    // Server über das Verlassen informieren
    ws.send(JSON.stringify({ type: "stop" }));
    
    // Lokalen Stream beenden
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
        localStream = null;
    }
    
    closePeerConnection();
    addMessage("System", "Chat beendet. Kamera ausgeschaltet.", true);
    document.querySelector(".btn-start").disabled = false;
    document.querySelector(".btn-stop").disabled = true;
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
