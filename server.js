// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let waitingClient = null; // Zwischenspeicher für User, die warten

wss.on("connection", (ws) => {
  console.log("Neuer Client verbunden");

  ws.partner = null;

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // Weiterleiten an Partner
    if (data.type === "offer" || data.type === "answer" || data.type === "candidate") {
      if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
        ws.partner.send(JSON.stringify(data));
      }
    }

    // Start-Matching
    if (data.type === "start") {
      if (waitingClient && waitingClient !== ws) {
        // Partner verbinden
        ws.partner = waitingClient;
        waitingClient.partner = ws;

        ws.send(JSON.stringify({ type: "match" }));
        waitingClient.send(JSON.stringify({ type: "match" }));

        waitingClient = null;
      } else {
        waitingClient = ws;
      }
    }

    // Stop Verbindung
    if (data.type === "stop") {
      if (ws.partner) {
        ws.partner.send(JSON.stringify({ type: "stop" }));
        ws.partner.partner = null;
        ws.partner = null;
      }
    }
  });

  ws.on("close", () => {
    console.log("Client getrennt");
    if (ws.partner) {
      ws.partner.send(JSON.stringify({ type: "stop" }));
      ws.partner.partner = null;
    }
    if (waitingClient === ws) {
      waitingClient = null;
    }
  });
});

app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log("Server läuft auf Port " + PORT));
