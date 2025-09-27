const startBtn = document.querySelector('.btn-start');
const localVideo = document.getElementById('localVideo');
const chatInput = document.querySelector('.chat-input input');
const sendBtn = document.querySelector('.btn-send');

let localStream;

async function startWebcam() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    console.log("Webcam gestartet ✅");
  } catch (err) {
    console.error("Fehler beim Starten der Webcam:", err);
    alert("Fehler: " + err.message);
  }
}

startBtn.addEventListener('click', startWebcam);

chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendBtn.onclick();
  }
});
