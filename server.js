const http = require("http");
const WebSocket = require("ws");
const express = require("express");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

let waiting = null;
const pairs = new Map();

wss.on("connection", (ws) => {
  console.log("🔗 Neuer Client verbunden");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // --- START ---
    if (data.type === "start") {
      if (waiting && waiting !== ws) {
        const caller = ws;
        const answerer = waiting;

        pairs.set(caller, answerer);
        pairs.set(answerer, caller);
        waiting = null;

        caller.send(JSON.stringify({ type: "matched", should_offer: true }));
        answerer.send(JSON.stringify({ type: "matched", should_offer: false }));
      } else {
        waiting = ws;
        ws.send(JSON.stringify({ type: "no-match" }));
      }
    }

    // --- NEXT & STOP ---
    else if (data.type === "next" || data.type === "stop") {
      const partner = pairs.get(ws);
      if (partner) {
        pairs.delete(ws);
        pairs.delete(partner);
        partner.send(JSON.stringify({ type: "partner-left" }));
      }
      if (data.type === "stop" && waiting === ws) waiting = null;
    }

    // --- WEBRTC SIGNALLING ---
    else if (["offer", "answer", "candidate"].includes(data.type)) {
      const partner = pairs.get(ws);
      if (partner && partner.readyState === WebSocket.OPEN) {
        partner.send(JSON.stringify(data));
      }
    }
  });

  ws.on("close", () => {
    const partner = pairs.get(ws);
    if (partner) {
      pairs.delete(ws);
      pairs.delete(partner);
      if (partner.readyState === WebSocket.OPEN) {
        partner.send(JSON.stringify({ type: "partner-left" }));
      }
    }
    if (waiting === ws) waiting = null;
    console.log("🔌 Client getrennt");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
