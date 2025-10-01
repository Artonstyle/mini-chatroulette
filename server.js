// =================================================================
// server.js - FÜR RENDER-DEPLOYMENT OPTIMIERT
// =================================================================

const http = require("http");
const WebSocket = require("ws");
const express = require("express");

const app = express();
const server = http.createServer(app);
// ⚠️ WICHTIG: Port wird von Render über Umgebungsvariable gesetzt (process.env.PORT)
const PORT = process.env.PORT || 3000;

// Korrektur: Dient statischen Dateien aus dem aktuellen Verzeichnis
// (Sicherstellen, dass index.html und client.js gefunden werden)
app.use(express.static('.')); 

const wss = new WebSocket.Server({ server });

let waiting = null; 
const pairs = new Map(); 

// Funktion zum Senden der aktuellen Besucherzahl an alle Clients
function broadcastUserCount() {
    const count = wss.clients.size;
    const message = JSON.stringify({ type: "user-count", count: count });
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    console.log(`[COUNT] Aktuelle Online-Anzahl: ${count}`);
}

// Funktion zum Beenden einer Verbindung und Benachrichtigen des Partners
function terminateConnection(ws) {
    const partner = pairs.get(ws);
    if (partner) {
        pairs.delete(ws);
        pairs.delete(partner);
        if (partner.readyState === WebSocket.OPEN) {
            partner.send(JSON.stringify({ type: "partner-left" }));
        }
    }
    if (waiting === ws) waiting = null;
}


wss.on("connection", (ws) => {
    console.log("🔗 Neuer Client verbunden");
    
    // Sende die Zahl bei JEDER Verbindung
    broadcastUserCount();

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);
        const partner = pairs.get(ws);

        // --- START-Logik (Suche nach Partner) ---
        if (data.type === "start") {
            if (waiting && waiting !== ws) {
                const caller = ws;       
                const answerer = waiting; 

                pairs.set(caller, answerer);
                pairs.set(answerer, caller);
                waiting = null; 
                console.log("-> Partner gefunden, starte Offer/Answer.");

                caller.send(JSON.stringify({ type: "matched", should_offer: true })); 
                answerer.send(JSON.stringify({ type: "matched", should_offer: false }));
            } else {
                waiting = ws;
                ws.send(JSON.stringify({ type: "no-match" }));
                console.log("-> Wartet auf Partner.");
            }
        }

        // --- NEXT- und STOP-Logik ---
        else if (data.type === "next") {
            terminateConnection(ws); // Beende alte Verbindung
            // Startet Suche sofort neu durch den Client
        }
        else if (data.type === "stop") {
            terminateConnection(ws); // Beende Verbindung und setze waiting zurück
        }

        // --- WEBRTC SIGNALING LOGIC ---
        else if (["offer", "answer", "candidate"].includes(data.type)) {
            if (partner && partner.readyState === WebSocket.OPEN) {
                partner.send(JSON.stringify(data));
            }
        }
    });

    ws.on("close", () => {
        console.log("🔗 Client getrennt");
        
        terminateConnection(ws); // Beende Verbindung zum Partner
        
        // Sende die aktualisierte Zahl nach der Trennung
        broadcastUserCount();
    });
});

server.listen(PORT, () => console.log(`🚀 Signalisierungsserver läuft auf Port ${PORT}`));
