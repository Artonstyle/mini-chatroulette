const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public")));

let waiting = null; // ein User wartet auf Partner
const pairs = new Map(); // Map: client → partner

wss.on("connection", (ws) => {
  console.log("🔗 Neuer Client");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "start") {
      // Prüfen ob schon jemand wartet
      if (waiting && waiting !== ws) {
        // Matchen
        pairs.set(ws, waiting);
        pairs.set(waiting, ws);

        waiting.send(JSON.stringify({ type: "match" }));
        ws.send(JSON.stringify({ type: "match" }));

        waiting = null; // keiner mehr wartet
      } else {
        waiting = ws; // dieser Client wartet jetzt
      }
    }

    else if (data.type === "next") {
      const partner = pairs.get(ws);
      if (partner) {
        pairs.delete(ws);
        pairs.delete(partner);
        partner.send(JSON.stringify({ type: "partner-left" }));
      }
      if (waiting && waiting !== ws) {
        pairs.set(ws, waiting);
        pairs.set(waiting, ws);
        waiting.send(JSON.stringify({ type: "match" }));
        ws.send(JSON.stringify({ type: "match" }));
        waiting = null;
      } else {
        waiting = ws;
      }
    }

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
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
