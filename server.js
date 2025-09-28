const http = require("http");
const WebSocket = require("ws");
const express = require("express");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Nützlich, wenn Sie die index.html über Render hosten wollen (nicht notwendig, wenn nur GitHub Pages/lokal)
app.use(express.static('public')); 

let waiting = null; // Vereinfachte Warteschlange (nimmt nur einen auf)
const pairs = new Map(); // Speichert, wer mit wem verbunden ist

wss.on("connection", (ws) => {
  console.log("🔗 Neuer Client verbunden");

  ws.on("message", (msg) => {
    const data = JSON.parse(msg);

    // --- START LOGIK (MATCHING) ---
    if (data.type === "start") {
      if (waiting && waiting !== ws) {
        // Match gefunden

        const caller = ws; 
        const answerer = waiting;

        pairs.set(caller, answerer);
        pairs.set(answerer, caller);
        waiting = null;

        // 1. Signal an den Caller: Erstelle Offer
        caller.send(JSON.stringify({ type: "matched", should_offer: true })); 
        
        // 2. Signal an den Answerer: Warte auf Offer
        answerer.send(JSON.stringify({ type: "matched", should_offer: false }));
      } else {
        waiting = ws;
      }
    }

    // --- NEXT LOGIK (NEUE SUCHE) ---
    else if (data.type === "next") {
      const partner = pairs.get(ws);
      if (partner) {
        pairs.delete(ws);
        pairs.delete(partner);
        partner.send(JSON.stringify({ type: "partner-left" }));
      }
        
        // Füge den Client wieder zur Warteschlange hinzu (oder matche sofort, falls jemand wartet)
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
      }
    }

    // --- STOP LOGIK ---
    else if (data.type === "stop") {
      const partner = pairs.get(ws);
      if (partner) {
        pairs.delete(ws);
        pairs.delete(partner);
        partner.send(JSON.stringify({ type: "partner-left" }));
      }
        // Entferne dich aus der Warteschlange, falls du gewartet hast
        if (waiting === ws) waiting = null; 
    }

    // --- WEBRTC SIGNALING LOGIK ---
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
    console.log("🔗 Client getrennt");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Signalisierungsserver läuft auf Port ${PORT}`));
