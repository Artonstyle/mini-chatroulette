// server.js
const WebSocket = require('ws');

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

let onlineCount = 0;

console.log(`WebSocket-Server läuft auf ws://localhost:${PORT}`);

// Broadcast-Funktion an alle verbundenen Clients
function broadcast(message, exclude) {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Online-Zähler aktualisieren
function broadcastOnlineCount() {
    broadcast({ type: 'onlineCount', count: onlineCount });
}

// Neue Verbindung
wss.on('connection', (ws) => {
    onlineCount++;
    console.log(`Neuer Client verbunden. Online: ${onlineCount}`);
    broadcastOnlineCount();

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);

            // WebRTC Signalisierung: offer, answer, candidate, hangup
            if (['offer', 'answer', 'candidate', 'hangup'].includes(data.type)) {
                broadcast(data, ws); // an alle außer Sender
            }

            // Chat-Nachrichten
            else if (data.type === 'chat') {
                broadcast(data, ws); // an alle außer Sender
            }

        } catch (err) {
            console.error('Fehler beim Parsen der Nachricht:', err);
        }
    });

    ws.on('close', () => {
        onlineCount--;
        console.log(`Client getrennt. Online: ${onlineCount}`);
        broadcastOnlineCount();
    });

    ws.on('error', (err) => {
        console.error('WebSocket Fehler:', err);
    });
});
