const http = require("http");
const WebSocket = require("ws");
const express = require("express");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Dient statischen Dateien aus dem 'public' Ordner, falls Sie die index.html auf Render hosten.
app.use(express.static('public')); 

let waiting = null; // Speichert den einen wartenden Client
const pairs = new Map(); // Speichert, wer mit wem verbunden ist

wss.on("connection", (ws) => {
    console.log("🔗 Neuer Client verbunden");

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        // --- START-Logik: Sucht einen Partner (ersetzt 'join') ---
        if (data.type === "start") {
            if (waiting && waiting !== ws) {
                // Match gefunden

                const caller = ws;        // Der Client, der gerade gestartet hat, wird der Anrufer (Offer)
                const answerer = waiting; // Der wartende Client wird der Antworter (Answer)

                pairs.set(caller, answerer);
                pairs.set(answerer, caller);
                waiting = null; // Warteschlange leeren

                // 1. Signal an den Caller: Erstelle Offer (soll_angebot_machen: true)
                caller.send(JSON.stringify({ type: "matched", should_offer: true })); 
                
                // 2. Signal an den Answerer: Warte auf Offer (soll_angebot_machen: false)
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
            // Bei 'next' startet der Client eine neue Suche mit 'start'
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
