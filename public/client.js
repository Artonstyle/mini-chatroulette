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

// Overlay
const remoteStatus = document.getElementById("remoteStatus");
const remoteStatusTitle = document.querySelector(".remote-status-title");
const remoteStatusSub = document.querySelector(".remote-status-sub");

const config = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" }
    ]
};

const SEARCHING_VIDEO_SRC = "/assets/searching.mp4";

// -------- UI --------

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

function setRemoteStatus(title, sub = "", show = true, loading = true) {
    if (!remoteStatus) return;

    if (remoteStatusTitle) remoteStatusTitle.textContent = title;
    if (remoteStatusSub) remoteStatusSub.textContent = sub;

    const spinner = remoteStatus.querySelector(".spinner");
    if (spinner) spinner.style.display = loading ? "block" : "none";

    remoteStatus.classList.toggle("show", show);
}

// -------- Kamera --------

async function startCamera() {
    if (localStream) return true;

    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });
        localVideo.srcObject = localStream;
        return true;
    } catch {
        addMessage("System", "❌ Kamera Zugriff fehlgeschlagen", true);
        return false;
    }
}

function stopCamera() {
    if (localStream) {
        localStream.getTracks().forEach(t => t.stop());
        localVideo.srcObject = null;
        localStream = null;
    }
}

// -------- WebRTC --------

function closePeerConnection(showSearch = true) {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    dataChannel = null;

    if (showSearch) {
        setRemoteStatus("Partner wird gesucht…", "Bitte warten", true, true);
    }

    document.querySelector(".btn-next").disabled = true;
    document.querySelector(".btn-send").disabled = true;
    input.disabled = true;
}

function createPeerConnection() {
    closePeerConnection(false);

    peerConnection = new RTCPeerConnection(config);

    localStream?.getTracks().forEach(t =>
        peerConnection.addTrack(t, localStream)
    );

    peerConnection.ontrack = (e) => {
        remoteVideo.srcObject = e.streams[0];
        setRemoteStatus("", "", false, false);

        document.querySelector(".btn-next").disabled = false;
        document.querySelector(".btn-send").disabled = false;
        input.disabled = false;
    };

    peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate }));
        }
    };

    dataChannel = peerConnection.createDataChannel("chat");
    dataChannel.onmessage = (e) => addMessage("Partner", e.data);

    peerConnection.ondatachannel = (e) => {
        dataChannel = e.channel;
        dataChannel.onmessage = (ev) => addMessage("Partner", ev.data);
    };
}

// -------- WebSocket --------

ws.onopen = () => {
    setRemoteStatus("Bereit", "Drücke Start", true, false);
};

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "matched" && data.should_offer) {
        createPeerConnection();
        setRemoteStatus("Verbinde…", "", true, true);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer }));

    } else if (data.type === "offer") {
        createPeerConnection();

        await peerConnection.setRemoteDescription(data.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        ws.send(JSON.stringify({ type: "answer", answer }));

    } else if (data.type === "answer") {
        await peerConnection.setRemoteDescription(data.answer);

    } else if (data.type === "candidate") {
        try {
            await peerConnection.addIceCandidate(data.candidate);
        } catch {}

    } else if (data.type === "partner-left") {
        closePeerConnection(true);
    }
};

// -------- BUTTONS --------

// START
document.querySelector(".btn-start").onclick = async () => {
    if (!await startCamera()) return;

    setRemoteStatus("Partner wird gesucht…", "", true, true);

    ws.send(JSON.stringify({ type: "start" }));

    document.querySelector(".btn-start").disabled = true;
    document.querySelector(".btn-stop").disabled = false;
};

// NEXT 🔥
document.querySelector(".btn-next").onclick = async () => {

    if (!localStream) {
        const ok = await startCamera();
        if (!ok) return;
    }

    if (peerConnection) {
        ws.send(JSON.stringify({ type: "next" }));
        closePeerConnection(false);
    }

    setRemoteStatus("Neuer Partner wird gesucht…", "", true, true);

    ws.send(JSON.stringify({ type: "start" }));

    document.querySelector(".btn-next").disabled = true;
};

// STOP
document.querySelector(".btn-stop").onclick = () => {
    ws.send(JSON.stringify({ type: "stop" });

    stopCamera();
    closePeerConnection(false);

    setRemoteStatus(
        "⛔ Suche wurde gestoppt",
        "Drücke Start um erneut zu suchen",
        true,
        false // ❌ Spinner aus
    );

    document.querySelector(".btn-start").disabled = false;
    document.querySelector(".btn-stop").disabled = true;
};

// CHAT
sendBtn.onclick = () => {
    const text = input.value.trim();

    if (text && dataChannel?.readyState === "open") {
        dataChannel.send(text);
        addMessage("Ich", text);
        input.value = "";
    }
};
