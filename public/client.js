// ACHTUNG: VERWENDEN SIE IHRE ECHTE RENDER-URL!
const WS_URL =
    window.location.protocol === "http:" || window.location.protocol === "https:"
        ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
        : "wss://mini-chatroulette.onrender.com";
try {
    localStorage.removeItem("mini-chatroulette-custom-bg");
    document.body?.classList.remove("custom-bg-active");
    document.body?.style.removeProperty("--custom-bg-image");
} catch (_) {}
const ws = new WebSocket(WS_URL);
const titleEl = document.querySelector("header");

let localStream;
let peerConnection;
let dataChannel;
let isMuted = false;
let isVideoMuted = false;
let currentFacingMode = "user";
let currentVideoDeviceId = null;
let titleDragState = null;
let disconnectGraceTimer = null;
let remoteButtonsRevealTimer = null;
let manualStopRequested = false;
let manualNextRequested = false;
let mobileControlsRevealTimer = null;

// DOM-Elemente
const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");
const messagesDiv = document.querySelector(".chat-messages");
const input = document.querySelector(".chat-input input");
const sendBtn = document.querySelector(".btn-send");
const startBtn = document.querySelector(".btn-start");
const nextBtn = document.querySelector(".btn-next");
const stopBtn = document.querySelector(".btn-stop");
const muteBtn = document.getElementById("btnMute");
const videoBtn = document.getElementById("btnVideo");
const cameraBtn = document.getElementById("btnCamera");
const layoutBtn = document.getElementById("btnLayout");
const desktopLayoutToggle = document.getElementById("desktopLayoutToggle");
const themeToggleDesktop = document.getElementById("themeToggleDesktop");
const themeToggleMobile = document.getElementById("themeToggleMobile");
const bgToggleDesktop = document.getElementById("bgToggleDesktop");
const bgToggleMobile = document.getElementById("bgToggleMobile");
const localBgInput = document.getElementById("localBgInput");
const remoteWrap = document.querySelector(".remote-wrap");
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
const VIDEO_ON_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 7.5h10A1.5 1.5 0 0 1 16 9v6a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 3 15V9a1.5 1.5 0 0 1 1.5-1.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="m16 10.2 4-2.2v8l-4-2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
`;
const VIDEO_OFF_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 7.5h10A1.5 1.5 0 0 1 16 9v6a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 3 15V9a1.5 1.5 0 0 1 1.5-1.5Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="m16 10.2 4-2.2v8l-4-2.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="m5 5 14 14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
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
const LAYOUT_1_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="12" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <rect x="13.5" y="13.5" width="6.5" height="5.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <path d="M9.2 10.4h1.7v5.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
`;
const LAYOUT_2_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="6.2" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <rect x="4" y="13" width="16" height="6.2" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.8"/>
        <path d="M10 9.2c.45-.53.96-.8 1.56-.8.84 0 1.44.44 1.44 1.15 0 .56-.34.92-.92 1.3l-.57.37c-.68.45-.97.84-.97 1.46v.12h2.6" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
`;
const LAYOUT_3_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 7.2 12 4l7.5 3.2v9.6L12 20l-7.5-3.2Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <path d="M12 4v16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M4.5 7.2 12 10.4l7.5-3.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
`;
const THEME_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3.6a8.4 8.4 0 1 0 8.4 8.4c0-.23-.01-.46-.03-.68a2.17 2.17 0 0 0-2.86-1.78l-1.28.45a1.9 1.9 0 0 1-2.48-1.8V6.8a2.2 2.2 0 0 0-1.7-2.14 8.73 8.73 0 0 0-1.09-.06Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        <circle cx="8.25" cy="10.3" r="1.15" fill="currentColor"/>
        <circle cx="11.4" cy="7.2" r="1.15" fill="currentColor"/>
        <circle cx="15.55" cy="14.2" r="1.15" fill="currentColor"/>
    </svg>
`;
const BG_ICON = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 18.5h15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        <path d="m6.5 18.5 4.2-5.3a1 1 0 0 1 1.58.02l2.2 2.82a1 1 0 0 0 1.58-.03l2.42-3.16a1 1 0 0 1 1.6.1l1.4 2.08" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="9" cy="8.2" r="1.4" fill="currentColor"/>
        <path d="M4.5 6.2A1.7 1.7 0 0 1 6.2 4.5h11.6a1.7 1.7 0 0 1 1.7 1.7v11.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
    </svg>
`;
let mobileLayoutMode = "overlay";
let overlayLayoutState = null;
let desktopLayoutMode = "desktop-layout-1";
const THEMES = ["theme-1", "theme-2", "theme-3", "theme-4", "theme-5", "theme-6"];
const BACKGROUNDS = ["bg-1", "bg-2", "bg-3", "bg-4"];
const DESKTOP_LAYOUTS = ["desktop-layout-1", "desktop-layout-2", "desktop-layout-3"];
const THEME_STORAGE_KEY = "mini-chatroulette-theme";
const BG_STORAGE_KEY = "mini-chatroulette-background";
const LOCAL_BG_STORAGE_KEY = "mini-chatroulette-custom-bg";
const LAYOUT_STORAGE_KEY = "mini-chatroulette-layout";
const DESKTOP_LAYOUT_STORAGE_KEY = "mini-chatroulette-desktop-layout";

function updateThemeButtons(themeName) {
    const themeNumber =
        themeName === "theme-6" ? "6" :
        themeName === "theme-5" ? "5" :
        themeName === "theme-4" ? "4" :
        themeName === "theme-3" ? "3" :
        themeName === "theme-2" ? "2" : "1";
    [themeToggleDesktop, themeToggleMobile].forEach((button) => {
        if (!button) return;
        button.innerHTML = `${THEME_ICON}<span>${themeNumber}</span>`;
        button.setAttribute("aria-label", `Theme wechseln, aktuell Theme ${themeNumber}`);
        button.title = `Theme wechseln, aktuell Theme ${themeNumber}`;
    });
}

function applyTheme(themeName) {
    const safeTheme = THEMES.includes(themeName) ? themeName : "theme-1";
    document.body.classList.remove(...THEMES);
    document.body.classList.add(safeTheme);
    localStorage.setItem(THEME_STORAGE_KEY, safeTheme);
    updateThemeButtons(safeTheme);
}

function cycleTheme() {
    const currentTheme = THEMES.find((themeName) => document.body.classList.contains(themeName)) || "theme-1";
    const currentIndex = THEMES.indexOf(currentTheme);
    const nextTheme = THEMES[(currentIndex + 1) % THEMES.length];
    applyTheme(nextTheme);
}

function updateBackgroundButtons(backgroundName) {
    const backgroundNumber =
        backgroundName === "bg-4" ? "4" :
        backgroundName === "bg-3" ? "3" :
        backgroundName === "bg-2" ? "2" : "1";
    [bgToggleDesktop, bgToggleMobile].forEach((button) => {
        if (!button) return;
        button.innerHTML = `${BG_ICON}<span>${backgroundNumber}</span>`;
        button.setAttribute("aria-label", `Hintergrund wechseln, aktuell Hintergrund ${backgroundNumber}`);
        button.title = `Hintergrund wechseln, aktuell Hintergrund ${backgroundNumber}`;
    });
}

function applyBackground(backgroundName) {
    const safeBackground = BACKGROUNDS.includes(backgroundName) ? backgroundName : "bg-1";
    document.body.classList.remove(...BACKGROUNDS);
    document.body.classList.add(safeBackground);
    localStorage.setItem(BG_STORAGE_KEY, safeBackground);
    updateBackgroundButtons(safeBackground);
}

function cycleBackground() {
    const currentBackground = BACKGROUNDS.find((bgName) => document.body.classList.contains(bgName)) || "bg-1";
    const currentIndex = BACKGROUNDS.indexOf(currentBackground);
    const nextBackground = BACKGROUNDS[(currentIndex + 1) % BACKGROUNDS.length];
    applyBackground(nextBackground);
}

function applyLocalBackground(imageDataUrl) {
    document.body.classList.remove("custom-bg-active");
    document.body.style.removeProperty("--custom-bg-image");
    localStorage.removeItem(LOCAL_BG_STORAGE_KEY);
}

function updateMsnVideoLaunchers() {
    if (localVideoWrap) {
        localVideoWrap.classList.toggle("has-live-video", Boolean(localStream && localVideo.srcObject));
    }

    const remoteHasLiveVideo = Boolean(remoteVideo && (remoteVideo.srcObject || (remoteVideo.src && remoteVideo.src !== SEARCHING_VIDEO_SRC)));
    const remoteSearching = remoteVideo?.src?.includes(SEARCHING_VIDEO_SRC);
    if (remoteVideo.parentElement) {
        remoteVideo.parentElement.classList.toggle("has-live-video", remoteHasLiveVideo && !remoteSearching);
    }
}

function updatePartnerMeta(partner) {
}

function handleLocalBackgroundSelection(event) {
    void event;
    applyLocalBackground("");
    event.target.value = "";
}

function openLocalBackgroundPicker() {
    applyLocalBackground("");
}

function updateDesktopLayoutButton() {
    if (!desktopLayoutToggle) return;

    if (desktopLayoutMode === "desktop-layout-3") {
        desktopLayoutToggle.innerHTML = `${LAYOUT_3_ICON}<span>3</span>`;
        desktopLayoutToggle.title = "Desktop Layout 3 aktiv";
        desktopLayoutToggle.setAttribute("aria-label", "Desktop Layout 3 aktiv, zum nächsten Layout wechseln");
    } else if (desktopLayoutMode === "desktop-layout-2") {
        desktopLayoutToggle.innerHTML = `${LAYOUT_2_ICON}<span>2</span>`;
        desktopLayoutToggle.title = "Desktop Layout 2 aktiv";
        desktopLayoutToggle.setAttribute("aria-label", "Desktop Layout 2 aktiv, zum nächsten Layout wechseln");
    } else {
        desktopLayoutToggle.innerHTML = `${LAYOUT_1_ICON}<span>1</span>`;
        desktopLayoutToggle.title = "Desktop Layout 1 aktiv";
        desktopLayoutToggle.setAttribute("aria-label", "Desktop Layout 1 aktiv, zum nächsten Layout wechseln");
    }
}

function applyDesktopLayout(layoutName) {
    const safeLayout = DESKTOP_LAYOUTS.includes(layoutName) ? layoutName : "desktop-layout-1";
    desktopLayoutMode = safeLayout;
    document.body.classList.remove(...DESKTOP_LAYOUTS);
    document.body.classList.add(safeLayout);
    if (safeLayout !== "desktop-layout-3" && remoteWrap) {
        remoteWrap.style.removeProperty("aspect-ratio");
    }
    localStorage.setItem(DESKTOP_LAYOUT_STORAGE_KEY, safeLayout);
    updateDesktopLayoutButton();
}

function cycleDesktopLayout() {
    const currentIndex = DESKTOP_LAYOUTS.indexOf(desktopLayoutMode);
    const nextLayout = DESKTOP_LAYOUTS[(currentIndex + 1) % DESKTOP_LAYOUTS.length];
    applyDesktopLayout(nextLayout);
}

function initTitleDrag() {
    if (!titleEl) return;

    titleEl.addEventListener("pointerdown", (event) => {
        if (window.innerWidth <= 800) return;

        const styles = getComputedStyle(document.documentElement);
        const currentX = parseFloat(styles.getPropertyValue("--title-offset-x")) || 0;
        const currentY = parseFloat(styles.getPropertyValue("--title-offset-y")) || 0;

        titleDragState = {
            startX: event.clientX,
            startY: event.clientY,
            offsetX: currentX,
            offsetY: currentY
        };

        titleEl.classList.add("dragging");
        titleEl.setPointerCapture?.(event.pointerId);
    });

    titleEl.addEventListener("pointermove", (event) => {
        if (!titleDragState) return;

        const deltaX = event.clientX - titleDragState.startX;
        const deltaY = event.clientY - titleDragState.startY;

        document.documentElement.style.setProperty("--title-offset-x", `${titleDragState.offsetX + deltaX}px`);
        document.documentElement.style.setProperty("--title-offset-y", `${titleDragState.offsetY + deltaY}px`);
    });

    const stopDrag = (event) => {
        if (!titleDragState) return;
        titleDragState = null;
        titleEl.classList.remove("dragging");
        if (event?.pointerId !== undefined) {
            titleEl.releasePointerCapture?.(event.pointerId);
        }
    };

    titleEl.addEventListener("pointerup", stopDrag);
    titleEl.addEventListener("pointercancel", stopDrag);
}

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

function updateVideoButton() {
    if (!videoBtn) return;

    if (isVideoMuted) {
        videoBtn.innerHTML = VIDEO_OFF_ICON;
        videoBtn.classList.add("active");
        videoBtn.title = "Kamera einschalten";
        videoBtn.setAttribute("aria-label", "Kamera einschalten");
    } else {
        videoBtn.innerHTML = VIDEO_ON_ICON;
        videoBtn.classList.remove("active");
        videoBtn.title = "Kamera ausschalten";
        videoBtn.setAttribute("aria-label", "Kamera ausschalten");
    }
}

function isMobile() {
    return window.innerWidth <= 800;
}

function syncLocalVideoAspectRatio() {
    if (!localVideoWrap || !localVideo) return;
    if (!localVideo.videoWidth || !localVideo.videoHeight) return;
    if (isMobile() && isSplitLayout()) return;

    if (isMobile()) {
        localVideoWrap.style.aspectRatio = "3 / 4";
        return;
    }

    localVideoWrap.style.aspectRatio = `${localVideo.videoWidth} / ${localVideo.videoHeight}`;
}

function syncRemoteVideoAspectRatio() {
    if (!remoteWrap || !remoteVideo) return;
    if (isMobile()) return;
    if (!document.body.classList.contains("desktop-layout-3")) return;
    if (!remoteVideo.videoWidth || !remoteVideo.videoHeight) return;

    remoteWrap.style.aspectRatio = `${remoteVideo.videoWidth} / ${remoteVideo.videoHeight}`;
}

function isSplitLayout() {
    return mobileLayoutMode === "split";
}

function setMobileControlsVisible(visible) {
    if (!localVideoWrap || !localVideoControls) return;
    if (!isMobile()) visible = false;

    localVideoWrap.classList.toggle("mobile-controls-open", visible);

    if (mobileControlsRevealTimer) {
        clearTimeout(mobileControlsRevealTimer);
        mobileControlsRevealTimer = null;
    }

    if (visible && document.body.classList.contains("chatting")) {
        mobileControlsRevealTimer = setTimeout(() => {
            localVideoWrap.classList.remove("mobile-controls-open");
            mobileControlsRevealTimer = null;
        }, 3000);
    }
}

function setRemoteButtonsVisible(visible, autoHide = false) {
    const remoteButtons = document.querySelector(".remote-buttons");
    if (!remoteButtons) return;

    remoteButtons.classList.toggle("revealed", visible);

    if (remoteButtonsRevealTimer) {
        clearTimeout(remoteButtonsRevealTimer);
        remoteButtonsRevealTimer = null;
    }

    if (visible && autoHide && document.body.classList.contains("chatting")) {
        remoteButtonsRevealTimer = setTimeout(() => {
            remoteButtons.classList.remove("revealed");
            remoteButtonsRevealTimer = null;
        }, 3000);
    }
}

function updateLayoutButton() {
    if (!layoutBtn) return;

    if (isSplitLayout()) {
        layoutBtn.innerHTML = LAYOUT_2_ICON;
        layoutBtn.classList.add("active");
        layoutBtn.title = "Layout 2 aktiv";
        layoutBtn.setAttribute("aria-label", "Layout 2 aktiv, zu Layout 1 wechseln");
    } else {
        layoutBtn.innerHTML = LAYOUT_1_ICON;
        layoutBtn.classList.remove("active");
        layoutBtn.title = "Layout 1 aktiv";
        layoutBtn.setAttribute("aria-label", "Layout 1 aktiv, zu Layout 2 wechseln");
    }
}

function applyMobileLayoutMode() {
    const activeSplitLayout = isMobile() && isSplitLayout();
    document.body.classList.toggle("mobile-split-view", activeSplitLayout);

    if (!localVideoWrap) return;

    if (activeSplitLayout) {
        overlayLayoutState = {
            left: localVideoWrap.style.left,
            top: localVideoWrap.style.top,
            right: localVideoWrap.style.right,
            width: localVideoWrap.style.width
        };

        localVideoWrap.style.left = "";
        localVideoWrap.style.top = "";
        localVideoWrap.style.right = "";
        localVideoWrap.style.width = "";
    } else if (overlayLayoutState) {
        localVideoWrap.style.left = overlayLayoutState.left || "";
        localVideoWrap.style.top = overlayLayoutState.top || "";
        localVideoWrap.style.right = overlayLayoutState.right || "";
        localVideoWrap.style.width = overlayLayoutState.width || "";
    }

    setMobileControlsVisible(false);
    updateLayoutButton();
    localStorage.setItem(LAYOUT_STORAGE_KEY, mobileLayoutMode);
}

function resetControlState() {
    isMuted = false;
    isVideoMuted = false;
    currentFacingMode = "user";
    currentVideoDeviceId = null;
    updateMuteButton();
    updateVideoButton();
    updateCameraButton();

    if (muteBtn) muteBtn.disabled = true;
    if (videoBtn) videoBtn.disabled = true;
    if (cameraBtn) cameraBtn.disabled = true;
    updateLayoutButton();
}

function enableVideoControls() {
    if (muteBtn) muteBtn.disabled = false;
    if (videoBtn) videoBtn.disabled = false;
    if (cameraBtn) cameraBtn.disabled = false;
    updateMuteButton();
    updateVideoButton();
    updateCameraButton();
}

function applyMuteToStream(stream) {
    if (!stream) return;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !isMuted;
}

function applyVideoStateToStream(stream) {
    if (!stream) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !isVideoMuted;
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
    applyVideoStateToStream(newStream);
    currentVideoDeviceId = videoTrack?.getSettings?.().deviceId || currentVideoDeviceId;
    syncLocalVideoAspectRatio();

    if (peerConnection) {
        await replaceTracksInPeerConnection(newStream);
    }

    if (stopOld && oldStream) {
        oldStream.getTracks().forEach(track => track.stop());
    }

    updateMsnVideoLaunchers();
}

function showSearchingOverlay(title = "Partner wird gesucht...", sub = "Bitte kurz warten") {
    remoteVideo.srcObject = null;
    remoteVideo.src = SEARCHING_VIDEO_SRC;
    remoteVideo.loop = true;
    if (remoteWrap) {
        remoteWrap.style.removeProperty("aspect-ratio");
    }
    setRemoteStatus(title, sub, true, true);
    updateMsnVideoLaunchers();
}

function showStoppedOverlay() {
    remoteVideo.srcObject = null;
    remoteVideo.src = "";
    remoteVideo.loop = false;
    if (remoteWrap) {
        remoteWrap.style.removeProperty("aspect-ratio");
    }
    setRemoteStatus(
        "Suche wurde gestoppt",
        "Drücke Start, um erneut zu suchen",
        true,
        false
    );
    updateMsnVideoLaunchers();
}

function hasActiveSession() {
    return Boolean(
        remoteVideo?.srcObject ||
        dataChannel?.readyState === "open" ||
        peerConnection?.connectionState === "connected" ||
        peerConnection?.iceConnectionState === "connected" ||
        peerConnection?.iceConnectionState === "completed"
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
    document.body.classList.remove("connected");

    if (disconnectGraceTimer) {
        clearTimeout(disconnectGraceTimer);
        disconnectGraceTimer = null;
    }

    setRemoteButtonsVisible(true, false);

    if (peerConnection) {
        if (remoteVideo.srcObject && remoteVideo.srcObject.getTracks) {
            remoteVideo.srcObject.getTracks().forEach(track => track.stop());
        }

        remoteVideo.srcObject = null;

        if (showSearching && !manualStopRequested) {
            remoteVideo.src = SEARCHING_VIDEO_SRC;
            remoteVideo.loop = true;
            setRemoteStatus("Partner wird gesucht...", "Bitte kurz warten", true, true);
        }

        peerConnection.close();
        peerConnection = null;
    }

    dataChannel = null;
    nextBtn.disabled = true;
    sendBtn.disabled = true;
    input.disabled = true;
    updateMsnVideoLaunchers();
}

function createPeerConnection() {
    closePeerConnection(false);
    peerConnection = new RTCPeerConnection(config);

    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    peerConnection.ontrack = (event) => {
        document.body.classList.add("connected");
        remoteVideo.src = "";
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.loop = false;
        syncRemoteVideoAspectRatio();
        setRemoteStatus("", "", false, false);
        updateMsnVideoLaunchers();
        setRemoteButtonsVisible(false, false);

        nextBtn.disabled = false;
        sendBtn.disabled = false;
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
        if (!peerConnection) return;

        const state = peerConnection.iceConnectionState;

        if (state === "connected" || state === "completed") {
            if (disconnectGraceTimer) {
                clearTimeout(disconnectGraceTimer);
                disconnectGraceTimer = null;
            }
            return;
        }

        if (state === "disconnected") {
            // Kurzzeitige ICE-Unterbrechungen sind auf Handy/Laptop normal.
            // Nicht sofort auf "Partner wird gesucht" springen.
            return;
        }

        if (state === "failed" || state === "closed") {
            if (disconnectGraceTimer) {
                clearTimeout(disconnectGraceTimer);
                disconnectGraceTimer = null;
            }
            closePeerConnection(true);
        }
    };
}

// --- WebSocket Events ---
ws.onopen = () => {
    startBtn.disabled = false;
    stopBtn.disabled = false;

    setRemoteStatus(
        "Bereit",
        "Wähle Optionen und drücke Start",
        true,
        false
    );

    resetControlState();
};

ws.onerror = () => {
    startBtn.disabled = true;
    if (hasActiveSession()) return;
    setRemoteStatus(
        "Verbindung fehlgeschlagen",
        "Bitte Seite neu laden und erneut versuchen",
        true,
        false
    );
};

ws.onclose = () => {
    startBtn.disabled = true;
    stopBtn.disabled = true;
    if (hasActiveSession()) return;
    setRemoteStatus(
        "Verbindung getrennt",
        "Bitte Seite neu laden",
        true,
        false
    );
};

ws.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    if (data.type === "matched" && data.should_offer) {
        manualStopRequested = false;
        manualNextRequested = false;
        createPeerConnection();
        setRemoteStatus("Partner gefunden", "Verbindung wird aufgebaut...", true, true);

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", offer }));

    } else if (data.type === "matched" && !data.should_offer) {
        manualStopRequested = false;
        manualNextRequested = false;
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
        if (manualStopRequested || manualNextRequested) return;
        closePeerConnection(true);

    } else if (data.type === "no-match") {
        if (manualStopRequested) return;
        manualNextRequested = false;
        setRemoteStatus("Partner wird gesucht...", "Bitte kurz warten", true, true);

    } else if (data.type === "user-count") {
        const onlineCountElement = document.getElementById("onlineCount");
        if (onlineCountElement) {
            onlineCountElement.textContent = data.count;
        }
    }
};

// --- Buttons ---
startBtn.onclick = async () => {
    manualStopRequested = false;
    manualNextRequested = false;
    if (ws.readyState !== WebSocket.OPEN) {
        setRemoteStatus(
            "Server nicht bereit",
            "Bitte Seite neu laden und erneut versuchen",
            true,
            false
        );
        return;
    }

    if (!await startCamera(false)) return;

    document.body.classList.add("chatting");
    document.body.classList.remove("filter-open");
    setRemoteButtonsVisible(false, false);

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

    startBtn.disabled = true;
    stopBtn.disabled = false;
    enableVideoControls();
};

nextBtn.onclick = async () => {
    manualStopRequested = false;
    manualNextRequested = true;
    if (!localStream) {
        const ok = await startCamera(false);
        if (!ok) return;
    }

    document.body.classList.add("chatting");
    document.body.classList.remove("filter-open");
    setRemoteButtonsVisible(false, false);

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

    nextBtn.disabled = true;
    stopBtn.disabled = false;
    enableVideoControls();
};

stopBtn.onclick = () => {
    manualStopRequested = true;
    manualNextRequested = false;
    document.body.classList.remove("connected");
    document.body.classList.remove("chatting");
    document.body.classList.remove("filter-open");

    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop" }));
    }

    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localVideo.srcObject = null;
        localStream = null;
    }

    closePeerConnection(false);
    showStoppedOverlay();

    startBtn.disabled = false;
    stopBtn.disabled = true;
    nextBtn.disabled = true;
    sendBtn.disabled = true;
    input.disabled = true;

    resetControlState();
    setMobileControlsVisible(false);
    setRemoteButtonsVisible(true, false);
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

if (videoBtn) {
    videoBtn.onclick = async () => {
        if (!localStream) {
            const ok = await startCamera(false);
            if (!ok) return;
        }

        const videoTrack = localStream?.getVideoTracks?.()[0];
        if (!videoTrack) return;

        isVideoMuted = !isVideoMuted;
        videoTrack.enabled = !isVideoMuted;
        updateVideoButton();
    };
}

cameraBtn.onclick = async () => {
    await switchCamera();
};

if (layoutBtn) {
    layoutBtn.onclick = () => {
        mobileLayoutMode = isSplitLayout() ? "overlay" : "split";
        applyMobileLayoutMode();
    };
}

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
            localVideoWrap.style.top = "112px";
            localVideoWrap.style.right = "10px";
            localVideoWrap.style.width = "118px";
            localVideoWrap.dataset.dragReady = "true";
        }

        applyMobileLayoutMode();
    }

    localVideoWrap.addEventListener("pointerdown", (e) => {
        if (!isMobile()) return;
        if (isSplitLayout()) return;

        const clickedButton = e.target.closest(".video-icon-btn");
        if (clickedButton) return;
        if (e.target.closest(".profile-form, select, option, label, button, input")) return;

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
        if (isSplitLayout()) return;
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
        if (e.target.closest(".video-icon-btn")) return;

        if (isMobile()) {
            const nextVisible = !localVideoWrap.classList.contains("mobile-controls-open");
            setMobileControlsVisible(nextVisible);
        }

        if (document.body.classList.contains("chatting")) {
            setRemoteButtonsVisible(true, true);
        }
    });

    window.addEventListener("pointerdown", (e) => {
        if (!isMobile()) return;

        if (document.body.classList.contains("chatting")) {
            const clickedRemoteButton = e.target.closest(".remote-buttons");
            if (!clickedRemoteButton) {
                setRemoteButtonsVisible(true, true);
            }
        }

        if (!localVideoWrap.classList.contains("mobile-controls-open")) return;
        if (localVideoWrap.contains(e.target)) return;
        if (remoteVideo.contains(e.target)) return;

        setMobileControlsVisible(false);
    });

    setInitialMobilePosition();
    updateMuteButton();
    updateVideoButton();
    updateCameraButton();
    updateLayoutButton();
    setRemoteButtonsVisible(true, false);
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || "theme-1";
    const savedBackground = localStorage.getItem(BG_STORAGE_KEY) || "bg-1";
    const savedDesktopLayout = localStorage.getItem(DESKTOP_LAYOUT_STORAGE_KEY) || "desktop-layout-1";
    const savedLayout = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (savedLayout === "split" || savedLayout === "overlay") {
        mobileLayoutMode = savedLayout;
    }
    applyTheme(savedTheme);
    applyBackground(savedBackground);
    applyLocalBackground("");
    applyDesktopLayout(savedDesktopLayout);
    applyMobileLayoutMode();
    updateMsnVideoLaunchers();
    initTitleDrag();

    if (themeToggleDesktop) {
        themeToggleDesktop.addEventListener("click", cycleTheme);
    }

    if (themeToggleMobile) {
        themeToggleMobile.addEventListener("click", cycleTheme);
    }

    if (bgToggleDesktop) {
        bgToggleDesktop.addEventListener("click", cycleBackground);
    }

    if (bgToggleMobile) {
        bgToggleMobile.addEventListener("click", cycleBackground);
    }

    if (desktopLayoutToggle) {
        desktopLayoutToggle.addEventListener("click", cycleDesktopLayout);
    }
})();

if (localVideo) {
    localVideo.addEventListener("loadedmetadata", syncLocalVideoAspectRatio);
    remoteVideo.addEventListener("loadedmetadata", syncRemoteVideoAspectRatio);
}

