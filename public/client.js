document.querySelector(".btn-start").onclick = async () => {
  await startCamera();
  ws.send(JSON.stringify({ type: "start" }));
};

document.querySelector(".btn-next").onclick = () => {
  ws.send(JSON.stringify({ type: "next" }));
};

document.querySelector(".btn-stop").onclick = () => {
  ws.close();
};

ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);

  if (data.type === "match") {
    createPeerConnection();
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", offer }));
  } 
  else if (data.type === "partner-left") {
    remoteVideo.srcObject = null;
    console.log("❌ Partner hat verlassen");
  }
  // ... der Rest (offer, answer, candidate) bleibt wie gehabt
};
