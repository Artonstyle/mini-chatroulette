// ACHTUNG: VERWENDEN SIE IHRE ECHTE RENDER-URL!
const WS_URL = "wss://mini-chatroulette.onrender.com";
const ws = new WebSocket(WS_URL);

let localStream;
let peerConnection;
let dataChannel;

// DOM-Elemente
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const messagesDiv = document.querySelector(".chat-messages");
const input = document.querySelector(".chat-input input");
const sendBtn = document.querySelector(".btn-send");

// Für zukünftige Profil-Logik
const genderSelect = document.getElementById("gender");
const searchSelect = document.getElementById("search");
const countrySelect = document.getElementById("country");

const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
    ]
};

// Platzhalter für "Suchen"-Animation
const SEARCHING_VIDEO_SRC = "/assets/searching.mp4";

// --- Hilfsfunktionen ---

function addMessage(sender, text, isSystem = false) {
    const div = document.createElement("div");
    div.textContent = `${sender}: ${text}`;
    if (isSystem) {
        div.style.color = "#ffc107";
        div.style.fontStyle = "italic";
    }
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function startCamera() {
    if (localStream) return true;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        return true;
    } catch (err) {
        addMessage("System", "❌ Fehler beim Zugriff auf Kamera/Mikrofon. Bitte erlauben Sie den Zugriff.", true);
        return false;
    }
}

function closePeerConnection() {
    if (peerConnection) {
        if (remoteVideo.srcObject) {
            if (remoteVideo.srcObject.getTracks) {
                remoteVideo.srcObject.getTracks().forEach(track => track.stop());
            }
        }
        remoteVideo.srcObject = null;
        remoteVideo.src = SEARCHING_VIDEO_SRC;
        remoteVideo.loop = true;
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

    // DataChannel für Chat
    dataChannel = peerConnection.createDataChannel("chat");
    dataChannel.onopen = () => addMessage("System", "💬 Chat-Kanal geöffnet.", true);
    dataChannel.onmessage = (event) => addMessage("Partner", event.data);

    // DataChannel empfangen
    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        dataChannel.onopen = () => addMessage("System", "💬 Chat-Kanal geöffnet.", true);
        dataChannel.onmessage = (e) => addMessage("Partner", e.data);
    };

    peerConnection.oniceconnectionstatechange = () => {
        if (
            peerConnection.iceConnectionState === "disconnected" ||
            peerConnection.iceConnectionState === "failed"
        ) {
            addMessage("System", `⚠️ Verbindung getrennt: ${peerConnection.iceConnectionState}`, true);
            closePeerConnection();
        }
    };
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
        createPeerConnection();
        addMessage("System", "Partner gefunden. Starte Videoanruf (Offer)...", true);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer }));

    } else if (data.type === "matched" && !data.should_offer) {
        addMessage("System", "Partner gefunden. Warte auf Videoanruf (Offer)...", true);

    } else if (data.type === "offer") {
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
        addMessage("System", "Ihr Partner hat die Verbindung getrennt.", true);
        closePeerConnection();

    } else if (data.type === "no-match") {
        addMessage("System", "Kein passender Partner gefunden. Wir warten weiter...", true);

    } else if (data.type === "user-count") {
        const onlineCountElement = document.getElementById("onlineCount");
        if (onlineCountElement) {
            onlineCountElement.textContent = data.count;
        }
    }
};

// --- Buttons mit Logik ---

document.querySelector(".btn-start").onclick = async () => {
    if (!await startCamera()) return;

    remoteVideo.srcObject = null;
    remoteVideo.src = SEARCHING_VIDEO_SRC;
    remoteVideo.loop = true;

    ws.send(JSON.stringify({ type: "start" }));

    addMessage("System", "Suche nach Partner...", true);
    document.querySelector(".btn-start").disabled = true;
};

document.querySelector(".btn-next").onclick = () => {
    if (peerConnection) {
        ws.send(JSON.stringify({ type: "next" }));
        closePeerConnection();
    }

    remoteVideo.srcObject = null;
    remoteVideo.src = SEARCHING_VIDEO_SRC;
    remoteVideo.loop = true;

    ws.send(JSON.stringify({ type: "start" }));

    addMessage("System", "Suche nach neuem Partner...", true);
    document.querySelector(".btn-next").disabled = true;
};

document.querySelector(".btn-stop").onclick = () => {
    ws.send(JSON.stringify({ type: "stop" }));

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
        localStream = null;
    }

    closePeerConnection();
    remoteVideo.srcObject = null;
    remoteVideo.src = "";
    remoteVideo.loop = false;
    addMessage("System", "Chat beendet. Kamera ausgeschaltet.", true);
    document.querySelector(".btn-start").disabled = false;
    document.querySelector(".btn-stop").disabled = true;
};

// Chat-Nachricht senden
sendBtn.onclick = () => {
    const text = input.value.trim();
    if (text && dataChannel && dataChannel.readyState === "open") {
        dataChannel.send(text);
        addMessage("Ich", text);
        input.value = "";
    } else if (text) {
        addMessage("System", "Chat-Kanal ist noch nicht bereit.", true);
    }
};

// --- Mobile Drag für eigenes Video ---
(function () {
    if (!localVideo) return;

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function isMobile() {
        return window.innerWidth <= 800;
    }

    function setInitialMobilePosition() {
        if (!isMobile()) {
            localVideo.style.left = "";
            localVideo.style.top = "";
            localVideo.style.right = "";
            localVideo.classList.remove("dragging");
            return;
        }

        if (!localVideo.dataset.dragReady) {
            localVideo.style.top = "70px";
            localVideo.style.right = "10px";
            localVideo.dataset.dragReady = "true";
        }
    }

    localVideo.addEventListener("pointerdown", (e) => {
        if (!isMobile()) return;

        dragging = true;
        localVideo.classList.add("dragging");

        const rect = localVideo.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        startX = e.clientX;
        startY = e.clientY;

        localVideo.style.left = rect.left + "px";
        localVideo.style.top = rect.top + "px";
        localVideo.style.right = "auto";

        e.preventDefault();
    });

    window.addEventListener("pointermove", (e) => {
        if (!dragging || !isMobile()) return;

        let newLeft = startLeft + (e.clientX - startX);
        let newTop = startTop + (e.clientY - startY);

        const maxLeft = window.innerWidth - localVideo.offsetWidth - 8;
        const maxTop = window.innerHeight - localVideo.offsetHeight - 8;

        if (newLeft < 8) newLeft = 8;
        if (newTop < 8) newTop = 8;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop > maxTop) newTop = maxTop;

        localVideo.style.left = newLeft + "px";
        localVideo.style.top = newTop + "px";
    });

    function stopDrag() {
        dragging = false;
        localVideo.classList.remove("dragging");
    }

    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    window.addEventListener("resize", setInitialMobilePosition);

    setInitialMobilePosition();
})();
