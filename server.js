const http = require("http");
const WebSocket = require("ws");
const express = require("express");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Dient statischen Dateien aus dem 'public' Ordner
app.use(express.static('public')); 

let waiting = null; // Speichert den einen wartenden Client
const pairs = new Map(); // Speichert, wer mit wem verbunden ist

// NEU: Funktion zum Senden der aktuellen Besucherzahl an alle Clients
function broadcastUserCount() {
    // wss.clients.size gibt die Anzahl der aktuell verbundenen Clients
    const count = wss.clients.size;
    const message = JSON.stringify({ type: "user-count", count: count });
    
    // Sende die Nachricht an ALLE verbundenen Clients
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

wss.on("connection", (ws) => {
    console.log("🔗 Neuer Client verbunden");
    
    // NEU: Sende die Zahl bei JEDER Verbindung
    broadcastUserCount();

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        // --- START-Logik: Sucht einen Partner ---
        if (data.type === "start") {
            if (waiting && waiting !== ws) {
                // Match gefunden

                const caller = ws;        
                const answerer = waiting; 

                pairs.set(caller, answerer);
                pairs.set(answerer, caller);
                waiting = null; // Warteschlange leeren

                caller.send(JSON.stringify({ type: "matched", should_offer: true })); 
                answerer.send(JSON.stringify({ type: "matched", should_offer: false }));
            } else {
                // Keinen Partner gefunden, in die Warteschlange stellen
                waiting = ws;
                ws.send(JSON.stringify({ type: "no-match" }));
            }
        }

        // --- NEXT- und STOP-Logik ---
        else if (data.type === "next" || data.type === "stop") {
            const partner = pairs.get(ws);
            if (partner) {
                pairs.delete(ws);
                pairs.delete(partner);
                partner.send(JSON.stringify({ type: "partner-left" }));
            }
            if (data.type === "stop" && waiting === ws) waiting = null;
        }

        // --- WEBRTC SIGNALING LOGIC ---
        else if (["offer", "answer", "candidate"].includes(data.type)) {
            const partner = pairs.get(ws);
            if (partner && partner.readyState === WebSocket.OPEN) {
                partner.send(JSON.stringify(data));
            }
        }
    });

    ws.on("close", () => {
        console.log("🔗 Client getrennt");
        
        // Aufräumlogik
        const partner = pairs.get(ws);
        if (partner) {
            pairs.delete(ws);
            pairs.delete(partner);
            if (partner.readyState === WebSocket.OPEN) {
                partner.send(JSON.stringify({ type: "partner-left" }));
            }
        }
        if (waiting === ws) waiting = null;
        
        // NEU: Sende die aktualisierte Zahl nach der Trennung
        broadcastUserCount();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Signalisierungsserver läuft auf Port ${PORT}`));
