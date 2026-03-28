// ACHTUNG: VERWENDEN SIE IHRE ECHTE RENDER-URL!
const WS_URL = "wss://mini-chatroulette.onrender.com";
const ws = new WebSocket(WS_URL);

let localStream;
let peerConnection;
let dataChannel;
let isMuted = false;
let currentFacingMode = "user";

// DOM-Elemente
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const messagesDiv = document.querySelector(".chat-messages");
const input = document.querySelector(".chat-input input");
const sendBtn = document.querySelector(".btn-send");
const muteBtn = document.getElementById("btnMute");
const cameraBtn = document.getElementById("btnCamera");
const localVideoWrap = document.querySelector(".local-video-wrap");

// Overlay-Elemente
const remoteStatus = document.getElementById("remoteStatus");
const remoteStatusTitle = document.querySelector(".remote-status-title");
const remoteStatusSub = document.querySelector(".remote-status-sub");

// Für Profil-Logik
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

const SEARCHING_VIDEO_SRC = "/assets/searching.mp4";

function addMessage(sender, text, isSystem = false) {
    if (isSystem) return;

    const wrapper = document.createElement("div");
    wrapper.classList.add("chat-message");

    const label = document.createElement("div");
    label.classList.add("chat-label");

    const content = document.createElement("div");
    content.classList.add("chat-text");

    if (sender === "Ich") {
        wrapper.classList.add("me");
        label.textContent = "Ich:";
    } else {
        wrapper.classList.add("partner");
        label.textContent = "Partner:";
    }

    content.textContent = text;

    wrapper.appendChild(label);
    wrapper.appendChild(content);
    messagesDiv.appendChild(wrapper);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    if (sender === "Partner") {
        window.dispatchEvent(new CustomEvent("partner-message-received"));
    }
}

function setRemoteStatus(title, sub = "", show = true, loading = true) {
    if (!remoteStatus) return;

    if (remoteStatusTitle) {
        remoteStatusTitle.textContent = title || "";
    }

    if (remoteStatusSub) {
        remoteStatusSub.textContent = sub || "";
    }

    const spinner = remoteStatus.querySelector(".spinner");
    if (spinner) {
        spinner.style.display = loading ? "block" : "none";
    }

    if (show) {
        remoteStatus.classList.add("show");
    } else {
        remoteStatus.classList.remove("show");
    }
}

function updateMuteButton() {
    if (!muteBtn) return;

    if (isMuted) {
        muteBtn.textContent = "🔇";
        muteBtn.classList.add("active");
        muteBtn.title = "Mikrofon an";
    } else {
        muteBtn.textContent = "🎤";
        muteBtn.classList.remove("active");
        muteBtn.title = "Mikrofon aus";
    }
}

function updateCameraButton() {
    if (!cameraBtn) return;

    if (currentFacingMode === "environment") {
        cameraBtn.textContent = "📷";
        cameraBtn.classList.add("active");
        cameraBtn.title = "Vorderkamera";
    } else {
        cameraBtn.textContent = "🔄";
        cameraBtn.classList.remove("active");
        cameraBtn.title = "Rückkamera";
    }
}

function resetControlState() {
    isMuted = false;
    currentFacingMode = "user";
    updateMuteButton();
    updateCameraButton();

    if (muteBtn) muteBtn.disabled = true;
    if (cameraBtn) cameraBtn.disabled = true;
}

function enableVideoControls() {
    if (muteBtn) muteBtn.disabled = false;
    if (cameraBtn) cameraBtn.disabled = false;
    updateMuteButton();
    updateCameraButton();
}

function applyMuteToStream(stream) {
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !isMuted;
}

async function getMediaStreamForFacingMode(facingMode) {
    try {
        return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: facingMode } },
            audio: true
        });
    } catch {
        return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: facingMode },
            audio: true
        });
    }
}

async function replaceTracksInPeerConnection(newStream) {
    if (!peerConnection) return;

    const senders = peerConnection.getSenders();

    for (const track of newStream.getTracks()) {
        const sender = senders.find((s) => s.track && s.track.kind === track.kind);

        if (sender) {
            await sender.replaceTrack(track);
        } else {
            peerConnection.addTrack(track, newStream);
        }
    }
}

async function setLocalStream(newStream, stopOld = true) {
    const oldStream = localStream;

    localStream = newStream;
    localVideo.srcObject = newStream;
    applyMuteToStream(newStream);

    if (peerConnection) {
        await replaceTracksInPeerConnection(newStream);
    }

    if (stopOld && oldStream) {
        oldStream.getTracks().forEach(track => track.stop());
    }
}

function showSearchingOverlay(title = "Partner wird gesucht…", sub = "Bitte kurz warten") {
    remoteVideo.srcObject = null;
    remoteVideo.src = SEARCHING_VIDEO_SRC;
    remoteVideo.loop = true;
    setRemoteStatus(title, sub, true, true);
}

function showStoppedOverlay() {
    remoteVideo.srcObject = null;
    remoteVideo.src = "";
    remoteVideo.loop = false;
    setRemoteStatus(
        "⛔ Suche wurde gestoppt",
        "Drücke Start, um erneut zu suchen",
        true,
        false
    );
}

async function startCamera(forceRestart = false) {
    if (localStream && !forceRestart) {
        enableVideoControls();
        return true;
    }

    try {
        const newStream = await getMediaStreamForFacingMode(currentFacingMode);
        await setLocalStream(newStream, true);
        enableVideoControls();
        return true;
    } catch (err) {
        addMessage("System", "❌ Fehler beim Zugriff auf Kamera/Mikrofon. Bitte erlauben Sie den Zugriff.", true);
        return false;
    }
}

async function switchCamera() {
    const previousFacingMode = currentFacingMode;
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";

    const ok = await startCamera(true);

    if (!ok) {
        currentFacingMode = previousFacingMode;
        updateCameraButton();
        return;
    }

    updateCameraButton();
}

function closePeerConnection(showSearching = true) {
    if (peerConnection) {
        if (remoteVideo.srcObject && remoteVideo.srcObject.getTracks) {
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        }

        remoteVideo.srcObject = null;

        if (showSearching) {
            remoteVideo.src = SEARCHING_VIDEO_SRC;
            remoteVideo.loop = true;
            setRemoteStatus("Partner wird gesucht…", "Bitte kurz warten", true, true);
        }

        peerConnection.close();
        peerConnection = null;
    }

    dataChannel = null;
    document.querySelector(".btn-next").disabled = true;
    document.querySelector(".btn-send").disabled = true;
    input.disabled = true;
}

function createPeerConnection() {
    closePeerConnection(false);
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = (event) => {
        remoteVideo.src = "";
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.loop = false;
        setRemoteStatus("", "", false, false);

        document.querySelector(".btn-next").disabled = false;
        document.querySelector(".btn-send").disabled = false;
        input.disabled = false;
    };

    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({ type: "candidate", candidate: event.candidate }));
        }
    };

    dataChannel = peerConnection.createDataChannel("chat");
    dataChannel.onmessage = (event) => addMessage("Partner", event.data);

    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        dataChannel.onmessage = (e) => addMessage("Partner", e.data);
    };

    peerConnection.oniceconnectionstatechange = () => {
        if (
            peerConnection &&
            (
                peerConnection.iceConnectionState === "disconnected" ||
                peerConnection.iceConnectionState === "failed"
            )
        ) {
            closePeerConnection(true);
        }
    };
}

// --- WebSocket Events ---
ws.onopen = () => {
    document.querySelector(".btn-start").disabled = false;
    document.querySelector(".btn-stop").disabled = false;

    setRemoteStatus(
        "Bereit",
        "Wähle Optionen und drücke Start",
        true,
        false
    );

    resetControlState();
};

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "matched" && data.should_offer) {
        createPeerConnection();
        setRemoteStatus("Partner gefunden", "Verbindung wird aufgebaut…", true, true);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer }));

    } else if (data.type === "matched" && !data.should_offer) {
        setRemoteStatus("Partner gefunden", "Warte auf Videoanruf…", true, true);

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
        closePeerConnection(true);

    } else if (data.type === "no-match") {
        setRemoteStatus("Partner wird gesucht…", "Bitte kurz warten", true, true);

    } else if (data.type === "user-count") {
        const onlineCountElement = document.getElementById("onlineCount");
        if (onlineCountElement) {
            onlineCountElement.textContent = data.count;
        }
    }
};

// --- Buttons ---
document.querySelector(".btn-start").onclick = async () => {
    if (!await startCamera(false)) return;

    document.body.classList.add("chatting");

    remoteVideo.srcObject = null;
    remoteVideo.src = SEARCHING_VIDEO_SRC;
    remoteVideo.loop = true;
    setRemoteStatus("Partner wird gesucht…", "Bitte kurz warten", true, true);

    ws.send(JSON.stringify({
        type: "start",
        gender: genderSelect.value,
        search: searchSelect.value,
        country: countrySelect.value
    }));

    document.querySelector(".btn-start").disabled = true;
    document.querySelector(".btn-stop").disabled = false;
    enableVideoControls();
};

document.querySelector(".btn-next").onclick = async () => {
    if (!localStream) {
        const ok = await startCamera(false);
        if (!ok) return;
    }

    if (peerConnection) {
        ws.send(JSON.stringify({ type: "next" }));
        closePeerConnection(false);
    }

    remoteVideo.srcObject = null;
    remoteVideo.src = SEARCHING_VIDEO_SRC;
    remoteVideo.loop = true;
    setRemoteStatus("Neuer Partner wird gesucht…", "Bitte kurz warten", true, true);

    ws.send(JSON.stringify({
        type: "start",
        gender: genderSelect.value,
        search: searchSelect.value,
        country: countrySelect.value
    }));

    document.querySelector(".btn-next").disabled = true;
    document.querySelector(".btn-stop").disabled = false;
    enableVideoControls();
};

document.querySelector(".btn-stop").onclick = () => {
    document.body.classList.remove("chatting");

    ws.send(JSON.stringify({ type: "stop" }));

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
        localStream = null;
    }

    closePeerConnection(false);
    showStoppedOverlay();

    document.querySelector(".btn-start").disabled = false;
    document.querySelector(".btn-stop").disabled = true;
    document.querySelector(".btn-next").disabled = true;
    document.querySelector(".btn-send").disabled = true;
    input.disabled = true;

    resetControlState();
};

muteBtn.onclick = async () => {
    if (!localStream) {
        const ok = await startCamera(false);
        if (!ok) return;
    }

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) return;

    isMuted = !isMuted;
    audioTrack.enabled = !isMuted;
    updateMuteButton();
};

cameraBtn.onclick = async () => {
    await switchCamera();
};

sendBtn.onclick = () => {
    const text = input.value.trim();

    if (text && dataChannel && dataChannel.readyState === "open") {
        dataChannel.send(text);
        addMessage("Ich", text);
        input.value = "";
    }
};

// --- Mobile Drag ---
(function () {
    if (!localVideoWrap) return;

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
            localVideoWrap.style.left = "";
            localVideoWrap.style.top = "";
            localVideoWrap.style.right = "";
            localVideo.classList.remove("dragging");
            return;
        }

        if (!localVideoWrap.dataset.dragReady) {
            localVideoWrap.style.top = "110px";
            localVideoWrap.style.right = "14px";
            localVideoWrap.dataset.dragReady = "true";
        }
    }

    localVideoWrap.addEventListener("pointerdown", (e) => {
        if (!isMobile()) return;

        const clickedButton = e.target.closest(".video-icon-btn");
        if (clickedButton) return;

        dragging = true;
        localVideo.classList.add("dragging");

        const rect = localVideoWrap.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        startX = e.clientX;
        startY = e.clientY;

        localVideoWrap.style.left = rect.left + "px";
        localVideoWrap.style.top = rect.top + "px";
        localVideoWrap.style.right = "auto";

        e.preventDefault();
    });

    window.addEventListener("pointermove", (e) => {
        if (!dragging || !isMobile()) return;

        let newLeft = startLeft + (e.clientX - startX);
        let newTop = startTop + (e.clientY - startY);

        const maxLeft = window.innerWidth - localVideoWrap.offsetWidth - 56;
        const maxTop = window.innerHeight - localVideoWrap.offsetHeight - 8;

        if (newLeft < 8) newLeft = 8;
        if (newTop < 8) newTop = 8;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop > maxTop) newTop = maxTop;

        localVideoWrap.style.left = newLeft + "px";
        localVideoWrap.style.top = newTop + "px";
    });

    function stopDrag() {
        dragging = false;
        localVideo.classList.remove("dragging");
    }

    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    window.addEventListener("resize", setInitialMobilePosition);

    setInitialMobilePosition();
    updateMuteButton();
    updateCameraButton();
})();
