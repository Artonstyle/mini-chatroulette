const WebSocket = require('ws');
const http = require('http');
const express = require('express');

const PORT = 8080; 

const app = express();
// Dient statische Dateien (wie index.html und client.js)
app.use(express.static('.')) 

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Speichert alle verbundenen Clients (für WebRTC Signalisierung und Zählung)
const clients = new Map(); 
let nextClientId = 0; 

// =================================================================
// NEU: FUNKTION ZUM SENDEN DES ZÄHLERS
// =================================================================

function broadcastOnlineCount() {
    const count = clients.size;
    const message = JSON.stringify({
        type: 'onlineCount',
        count: count
    });
    
    // Sende die neue Zählung an alle verbundenen Clients
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
    console.log(`Aktuelle Online-Anzahl gesendet: ${count}`);
}

// =================================================================
// WEBSOCKET-HANDLER
// =================================================================

wss.on('connection', (ws) => {
    // Neuen Client hinzufügen und ID zuweisen
    ws.id = nextClientId++;
    clients.set(ws.id, ws);
    console.log(`Client ${ws.id} verbunden. Total: ${clients.size}`);
    
    // Sende die aktuelle Zählung sofort an den neuen Client und alle anderen
    broadcastOnlineCount();

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        console.log(`Nachricht von Client ${ws.id}: ${data.type}`);
        
        // WebRTC Signalisierung (sende die Nachricht an einen zufälligen anderen Client)
        // HINWEIS: Für eine korrekte "Chatroulette"-Logik müsste hier eine Logik zur Partnerwahl implementiert werden.
        
        // Einfache Weiterleitung an einen anderen Client (der erste gefundene)
        clients.forEach(client => {
            if (client.id !== ws.id && client.readyState === WebSocket.OPEN) {
                // Sende die Nachricht des aktuellen Clients an den Partner
                client.send(JSON.stringify(data));
                return; // Sende nur an den ersten verfügbaren Partner
            }
        });
    });

    ws.on('close', () => {
        clients.delete(ws.id);
        console.log(`Client ${ws.id} getrennt. Total: ${clients.size}`);
        
        // Sende die aktualisierte Zählung, wenn ein Client die Verbindung trennt
        broadcastOnlineCount();
    });

    ws.on('error', (error) => {
        console.error(`WebSocket-Fehler bei Client ${ws.id}:`, error);
    });
});

// Starte den HTTP-Server
server.listen(PORT, () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
    console.log(`WebSocket-Server lauscht auf Port ${PORT}`);
});
