// ACHTUNG: VERWENDEN SIE IHRE ECHTE RENDER-URL!
const WS_URL = "wss://mini-chatroulette.onrender.com";
const ws = new WebSocket(WS_URL);

let localStream;
let peerConnection;
let dataChannel;
let isMuted = false;
let currentFacingMode = "user";
let currentVideoDeviceId = null;
let autoFramingDetector = null;
let autoFramingTimer = null;
let autoFramingSession = 0;

// DOM-Elemente
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const messagesDiv = document.querySelector(".chat-messages");
const input = document.querySelector(".chat-input input");
const sendBtn = document.querySelector(".btn-send");
const muteBtn = document.getElementById("btnMute");
const cameraBtn = document.getElementById("btnCamera");
const localVideoWrap = document.querySelector(".local-video-wrap");
const localVideoControls = document.querySelector(".local-video-controls");

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
const MIC_ON_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="M12 17v3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="M9.5 20h5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
    </svg>
`;
const MIC_OFF_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15a3 3 0 0 0 2.68-1.65" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="M9 9.5V7a3 3 0 1 1 6 0v3.2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="M6.5 11.5a5.5 5.5 0 0 0 8.16 4.81" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="M12 17v3" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="M9.5 20h5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="m5 5 14 14" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
    </svg>
`;
const CAMERA_SWITCH_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 9.5h10.2a2 2 0 0 0 1.45-.62l1.15-1.2H20a1.5 1.5 0 0 1 1.5 1.5v7.32A1.5 1.5 0 0 1 20 18H4.5A1.5 1.5 0 0 1 3 16.5V11A1.5 1.5 0 0 1 4.5 9.5Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="M8.2 14.1a3.1 3.1 0 0 0 5.56 1.22" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="M15.6 15.3 14 15l-.34 1.62" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="M15.8 12.3a3.1 3.1 0 0 0-5.56-1.22" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
        <path d="m8.4 11.1 1.6.3.34-1.62" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"/>
    </svg>
`;

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
        muteBtn.innerHTML = MIC_OFF_ICON;
        muteBtn.classList.add("active");
        muteBtn.title = "Mikrofon an";
        muteBtn.setAttribute("aria-label", "Mikrofon aktivieren");
    } else {
        muteBtn.innerHTML = MIC_ON_ICON;
        muteBtn.classList.remove("active");
        muteBtn.title = "Mikrofon aus";
        muteBtn.setAttribute("aria-label", "Mikrofon stummschalten");
    }
}

function updateCameraButton() {
    if (!cameraBtn) return;

    cameraBtn.innerHTML = CAMERA_SWITCH_ICON;

    if (currentFacingMode === "environment") {
        cameraBtn.classList.add("active");
        cameraBtn.title = "Vorderkamera";
        cameraBtn.setAttribute("aria-label", "Zur Vorderkamera wechseln");
    } else {
        cameraBtn.classList.remove("active");
        cameraBtn.title = "Rückkamera";
        cameraBtn.setAttribute("aria-label", "Zur Rückkamera wechseln");
    }
}

function isMobile() {
    return window.innerWidth <= 800;
}

function setMobileControlsVisible(visible) {
    if (!localVideoWrap || !localVideoControls) return;
    if (!isMobile()) visible = false;

    localVideoWrap.classList.toggle("mobile-controls-open", visible);
}

function resetLocalVideoFraming() {
    if (!localVideo) return;

    localVideo.style.objectPosition = "50% 50%";
    localVideo.style.transform = "scale(1)";
}

function stopAutoFraming() {
    autoFramingSession += 1;

    if (autoFramingTimer) {
        clearTimeout(autoFramingTimer);
        autoFramingTimer = null;
    }

    resetLocalVideoFraming();
}

async function startAutoFraming() {
    stopAutoFraming();

    if (!("FaceDetector" in window) || !localStream || !localVideo) {
        return;
    }

    try {
        autoFramingDetector ||= new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    } catch {
        return;
    }

    const session = autoFramingSession;

    async function run() {
        if (session !== autoFramingSession || !localStream || !localVideo.srcObject) {
            return;
        }

        try {
            if (localVideo.readyState >= 2 && localVideo.videoWidth > 0 && localVideo.videoHeight > 0) {
                const faces = await autoFramingDetector.detect(localVideo);
                const face = faces[0];

                if (face?.boundingBox) {
                    const { x, y, width, height } = face.boundingBox;
                    const centerX = ((x + width / 2) / localVideo.videoWidth) * 100;
                    const centerY = ((y + height / 2) / localVideo.videoHeight) * 100;
                    const faceRatio = Math.max(width / localVideo.videoWidth, height / localVideo.videoHeight);
                    const zoom = Math.min(Math.max(1.08, 0.34 / Math.max(faceRatio, 0.14)), 1.45);

                    localVideo.style.objectPosition = `${centerX}% ${centerY}%`;
                    localVideo.style.transform = `scale(${zoom.toFixed(3)})`;
                } else {
                    resetLocalVideoFraming();
                }
            }
        } catch {
            resetLocalVideoFraming();
        }

        autoFramingTimer = window.setTimeout(run, 420);
    }

    run();
}

function resetControlState() {
    isMuted = false;
    currentFacingMode = "user";
    currentVideoDeviceId = null;
    stopAutoFraming();
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

async function getVideoStreamForFacingMode(facingMode) {
    try {
        return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: facingMode } },
            audio: false
        });
    } catch {
        return await navigator.mediaDevices.getUserMedia({
            video: { facingMode },
            audio: false
        });
    }
}

async function getNextVideoDeviceId() {
    if (!navigator.mediaDevices?.enumerateDevices) return null;

    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((device) => device.kind === "videoinput");

    if (videoInputs.length < 2) return null;

    const currentIndex = videoInputs.findIndex((device) => device.deviceId === currentVideoDeviceId);

    if (currentIndex === -1) {
        return videoInputs[1]?.deviceId || videoInputs[0]?.deviceId || null;
    }

    return videoInputs[(currentIndex + 1) % videoInputs.length]?.deviceId || null;
}

async function getMediaStreamForNextCamera() {
    const nextDeviceId = await getNextVideoDeviceId();

    if (!nextDeviceId) return null;

    return navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextDeviceId } },
        audio: true
    });
}

async function getVideoStreamForNextCamera() {
    const nextDeviceId = await getNextVideoDeviceId();

    if (!nextDeviceId) return null;

    return navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: nextDeviceId } },
        audio: false
    });
}

function combineVideoWithCurrentAudio(videoStream) {
    const tracks = [...videoStream.getVideoTracks()];

    if (localStream) {
        tracks.push(...localStream.getAudioTracks());
    }

    return new MediaStream(tracks);
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
    const videoTrack = newStream.getVideoTracks()[0];

    localStream = newStream;
    localVideo.srcObject = newStream;
    applyMuteToStream(newStream);
    currentVideoDeviceId = videoTrack?.getSettings?.().deviceId || currentVideoDeviceId;

    if (peerConnection) {
        await replaceTracksInPeerConnection(newStream);
    }

    if (stopOld && oldStream) {
        oldStream.getTracks().forEach(track => track.stop());
    }

    await startAutoFraming();
}

function showSearchingOverlay(title = "Partner wird gesucht...", sub = "Bitte kurz warten") {
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
        "Suche wurde gestoppt",
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
        addMessage("System", "Fehler beim Zugriff auf Kamera/Mikrofon. Bitte erlauben Sie den Zugriff.", true);
        return false;
    }
}

async function switchCamera() {
    const previousFacingMode = currentFacingMode;
    currentFacingMode = currentFacingMode === "user" ? "environment" : "user";

    async function trySwitch(shouldStopCurrentVideo = false) {
        const currentVideoTracks = localStream ? localStream.getVideoTracks() : [];

        if (shouldStopCurrentVideo) {
            currentVideoTracks.forEach((track) => track.stop());
        }

        try {
            const videoStream = await getVideoStreamForFacingMode(currentFacingMode);
            const newStream = combineVideoWithCurrentAudio(videoStream);
            await setLocalStream(newStream, false);
            currentVideoTracks.forEach((track) => track.stop());
            return true;
        } catch {
            try {
                const videoStream = await getVideoStreamForNextCamera();

                if (!videoStream) {
                    return false;
                }

                const newStream = combineVideoWithCurrentAudio(videoStream);
                await setLocalStream(newStream, false);
                currentVideoTracks.forEach((track) => track.stop());
                return true;
            } catch {
                return false;
            }
        }
    }

    let ok = await trySwitch(false);

    if (!ok) {
        ok = await trySwitch(true);
    }

    if (!ok) {
        currentFacingMode = previousFacingMode;
        updateCameraButton();
        return;
    }

    enableVideoControls();
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
            setRemoteStatus("Partner wird gesucht...", "Bitte kurz warten", true, true);
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
        setRemoteStatus("Partner gefunden", "Verbindung wird aufgebaut...", true, true);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer }));

    } else if (data.type === "matched" && !data.should_offer) {
        setRemoteStatus("Partner gefunden", "Warte auf Videoanruf...", true, true);

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
        setRemoteStatus("Partner wird gesucht...", "Bitte kurz warten", true, true);

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
    setRemoteStatus("Partner wird gesucht...", "Bitte kurz warten", true, true);

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
    setRemoteStatus("Neuer Partner wird gesucht...", "Bitte kurz warten", true, true);

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
    setMobileControlsVisible(false);
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
    if (!localVideoWrap || !remoteVideo) return;

    const activePointers = new Map();
    let dragging = false;
    let pinching = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let startDistance = 0;
    let startWidth = 92;

    function getPointerDistance() {
        const [first, second] = [...activePointers.values()];
        if (!first || !second) return 0;
        return Math.hypot(second.x - first.x, second.y - first.y);
    }

    function clampLocalVideoPosition() {
        let currentLeft = parseFloat(localVideoWrap.style.left || "0");
        let currentTop = parseFloat(localVideoWrap.style.top || "0");

        const maxLeft = window.innerWidth - localVideoWrap.offsetWidth - 8;
        const maxTop = window.innerHeight - localVideoWrap.offsetHeight - 8;

        if (currentLeft < 8) currentLeft = 8;
        if (currentTop < 8) currentTop = 8;
        if (currentLeft > maxLeft) currentLeft = maxLeft;
        if (currentTop > maxTop) currentTop = maxTop;

        localVideoWrap.style.left = currentLeft + "px";
        localVideoWrap.style.top = currentTop + "px";
    }

    function setInitialMobilePosition() {
        if (!isMobile()) {
            localVideoWrap.style.left = "";
            localVideoWrap.style.top = "";
            localVideoWrap.style.right = "";
            localVideoWrap.style.width = "";
            localVideo.classList.remove("dragging");
            setMobileControlsVisible(false);
            activePointers.clear();
            dragging = false;
            pinching = false;
            return;
        }

        if (!localVideoWrap.dataset.dragReady) {
            localVideoWrap.style.top = "110px";
            localVideoWrap.style.right = "14px";
            localVideoWrap.style.width = "92px";
            localVideoWrap.dataset.dragReady = "true";
        }
    }

    localVideoWrap.addEventListener("pointerdown", (e) => {
        if (!isMobile()) return;

        const clickedButton = e.target.closest(".video-icon-btn");
        if (clickedButton) return;

        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        const rect = localVideoWrap.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;

        localVideoWrap.style.left = rect.left + "px";
        localVideoWrap.style.top = rect.top + "px";
        localVideoWrap.style.right = "auto";

        if (activePointers.size === 1) {
            startX = e.clientX;
            startY = e.clientY;
            dragging = true;
            pinching = false;
        } else if (activePointers.size === 2) {
            dragging = false;
            pinching = true;
            startDistance = getPointerDistance();
            startWidth = rect.width;
        }

        localVideo.classList.add("dragging");
        setMobileControlsVisible(false);
        e.preventDefault();
    });

    window.addEventListener("pointermove", (e) => {
        if (!isMobile()) return;
        if (!activePointers.has(e.pointerId)) return;

        activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pinching && activePointers.size >= 2) {
            const nextDistance = getPointerDistance();
            const scale = startDistance > 0 ? nextDistance / startDistance : 1;
            const nextWidth = Math.min(Math.max(startWidth * scale, 92), Math.min(window.innerWidth * 0.55, 220));

            localVideoWrap.style.width = nextWidth + "px";
            clampLocalVideoPosition();
            return;
        }

        if (!dragging) return;

        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;

        let newLeft = startLeft + deltaX;
        let newTop = startTop + deltaY;

        const maxLeft = window.innerWidth - localVideoWrap.offsetWidth - 8;
        const maxTop = window.innerHeight - localVideoWrap.offsetHeight - 8;

        if (newLeft < 8) newLeft = 8;
        if (newTop < 8) newTop = 8;
        if (newLeft > maxLeft) newLeft = maxLeft;
        if (newTop > maxTop) newTop = maxTop;

        localVideoWrap.style.left = newLeft + "px";
        localVideoWrap.style.top = newTop + "px";
    });

    function stopDrag(e) {
        activePointers.delete(e.pointerId);

        if (activePointers.size < 2) {
            pinching = false;
        }

        if (activePointers.size === 1 && !pinching) {
            const remainingPointer = [...activePointers.values()][0];
            startX = remainingPointer.x;
            startY = remainingPointer.y;
            startLeft = localVideoWrap.getBoundingClientRect().left;
            startTop = localVideoWrap.getBoundingClientRect().top;
            dragging = true;
            return;
        }

        localVideo.classList.remove("dragging");
        dragging = false;
    }

    window.addEventListener("pointerup", stopDrag);
    window.addEventListener("pointercancel", stopDrag);
    window.addEventListener("resize", setInitialMobilePosition);

    remoteVideo.addEventListener("pointerdown", (e) => {
        if (!isMobile()) return;
        if (e.target.closest(".video-icon-btn")) return;

        const nextVisible = !localVideoWrap.classList.contains("mobile-controls-open");
        setMobileControlsVisible(nextVisible);
    });

    window.addEventListener("pointerdown", (e) => {
        if (!isMobile()) return;
        if (!localVideoWrap.classList.contains("mobile-controls-open")) return;
        if (localVideoWrap.contains(e.target)) return;
        if (remoteVideo.contains(e.target)) return;

        setMobileControlsVisible(false);
    });

    setInitialMobilePosition();
    updateMuteButton();
    updateCameraButton();
})();

