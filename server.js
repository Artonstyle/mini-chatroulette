const http = require("http");
const WebSocket = require("ws");
const express = require("express");

const app = express();

// Statische Dateien ausliefern (HTML + JS)
app.use(express.static("public"));

// HTTP-Server nur auf Port 3000
const server = http.createServer(app);

// WebSocket-Server auf demselben Server laufen lassen
const wss = new WebSocket.Server({ server });

let waitingClient = null;

wss.on("connection", (ws) => {
  console.log("👤 Neuer Client verbunden");

  ws.on("message", (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    if (data.type === "start") {
      if (waitingClient) {
        ws.partner = waitingClient;
        waitingClient.partner = ws;
        ws.send(JSON.stringify({ type: "match" }));
        waitingClient.send(JSON.stringify({ type: "match" }));
        waitingClient = null;
      } else {
        waitingClient = ws;
      }
    }

    if (data.type === "stop") {
      if (ws.partner) {
        ws.partner.send(JSON.stringify({ type: "stop" }));
        ws.partner.partner = null;
        ws.partner = null;
      }
      if (waitingClient === ws) {
        waitingClient = null;
      }
    }

    if (["offer", "answer", "candidate"].includes(data.type) && ws.partner) {
      ws.partner.send(JSON.stringify(data));
    }
  });

  ws.on("close", () => {
    if (ws.partner) {
      ws.partner.send(JSON.stringify({ type: "stop" }));
      ws.partner.partner = null;
    }
    if (waitingClient === ws) {
      waitingClient = null;
    }
  });
});

server.listen(3000, () => {
  console.log("🚀 Node-Server läuft auf http://localhost:3000");
});
