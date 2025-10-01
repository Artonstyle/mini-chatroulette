// server.js
// Minimaler HTTP + WebSocket Server mit einfacher Matchmaking-Logik
const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Statische Dateien (public/index.html, public/client.js)
app.use(express.static(path.join(__dirname, "public")));

// Erzeuge HTTP-Server
const server = http.createServer(app);

// WebSocket-Server auf dem selben HTTP-Server (Upgrade wird durch Nginx weitergereicht)
const wss = new WebSocket.Server({ server });

let waitingClient = null;

wss.on("connection", (ws, req) => {
  console.log("👤 Neuer Client verbunden");

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      console.error("Ungültige Nachricht:", message);
      return;
    }

    // Start-Matchmaking
    if (data.type === "start") {
      console.log("Start erhalten");
      if (waitingClient && waitingClient.readyState === WebSocket.OPEN) {
        // Match gefunden
        ws.partner = waitingClient;
        waitingClient.partner = ws;

        ws.send(JSON.stringify({ type: "match" }));
        waitingClient.send(JSON.stringify({ type: "match" }));

        waitingClient = null;
        console.log("🔗 Match erstellt");
      } else {
        // setze als wartender Client
        waitingClient = ws;
        console.log("⏳ Client in Warteschlange");
      }
    }

    // Stop: Trenne Partner / Entferne aus Warteschlange
    if (data.type === "stop") {
      console.log("Stop erhalten");
      if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
        ws.partner.send(JSON.stringify({ type: "stop" }));
        ws.partner.partner = null;
      }
      if (waitingClient === ws) waitingClient = null;
      ws.partner = null;
    }

    // Signal-Forwarding (offer/answer/candidate)
    if (["offer", "answer", "candidate"].includes(data.type)) {
      if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
        ws.partner.send(JSON.stringify(data));
      }
    }
  });

  ws.on("close", () => {
    console.log("❌ Client getrennt");
    // Wenn Partner da ist → informieren
    if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
      ws.partner.send(JSON.stringify({ type: "stop" }));
      ws.partner.partner = null;
    }
    if (waitingClient === ws) waitingClient = null;
  });

  ws.on("error", (err) => {
    console.error("WebSocket Fehler:", err);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server läuft auf http://localhost:${PORT}`);
});
