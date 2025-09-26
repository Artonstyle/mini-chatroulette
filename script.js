const socket = io();
let pc = new RTCPeerConnection();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localVideo.srcObject = stream;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  });

pc.ontrack = (event) => {
  remoteVideo.srcObject = event.streams[0];
};

socket.on("match", async (partnerId) => {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit("signal", { to: partnerId, data: offer });
});

socket.on("signal", async ({ from, data }) => {
  if (data.type === "offer") {
    await pc.setRemoteDescription(new RTCSessionDescription(data));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("signal", { to: from, data: answer });
  } else if (data.type === "answer") {
    await pc.setRemoteDescription(new RTCSessionDescription(data));
  } else if (data.candidate) {
    await pc.addIceCandidate(new RTCIceCandidate(data));
  }
});

pc.onicecandidate = (event) => {
  if (event.candidate) {
    socket.emit("signal", { data: event.candidate });
  }
};
