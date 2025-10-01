// server.js
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let waitingClient = null; // Zwischenspeicher für User, die warten

// 1. Statische Dateien aus dem 'public'-Ordner ausliefern (CSS, Client JS etc.)
app.use(express.static(path.join(__dirname, "public")));

// 2. DIE KORRIGIERTE STELLE: Hauptseite (index.html) ausliefern, wenn die Basis-URL aufgerufen wird.
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

wss.on("connection", (ws) => {
  console.log("Neuer Client verbunden");

  ws.partner = null;

  ws.on("message", (msg) => {
    // Sicherstellen, dass die Nachricht ein String ist, bevor JSON.parse aufgerufen wird
    if (typeof msg === 'string') {
        const data = JSON.parse(msg);

        // Weiterleiten an Partner (WebRTC-Daten)
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
            // Aktuellen Client in die Warteschlange setzen
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
    }
  });

  ws.on("close", () => {
    console.log("Client getrennt");
    
    // Partner informieren und dessen Verweis löschen
    if (ws.partner) {
      ws.partner.send(JSON.stringify({ type: "stop" }));
      ws.partner.partner = null;
    }
    
    // Falls der getrennte Client der wartende Client war, Warteschlange leeren
    if (waitingClient === ws) {
      waitingClient = null;
    }
  });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
