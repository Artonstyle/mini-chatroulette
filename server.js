const WebSocket = require('ws');

const PORT = 8080;
const wss = new WebSocket.Server({ port: PORT });

let onlineCount = 0;

console.log(`WebSocket-Server läuft auf ws://localhost:${PORT}`);

// Broadcast an alle
function broadcast(message) {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Online-Zähler aktualisieren
function broadcastOnlineCount() {
    broadcast({ type: 'onlineCount', count: onlineCount });
}

wss.on('connection', (ws) => {
    onlineCount++;
    broadcastOnlineCount(); // direkt beim Verbinden

    ws.on('message', (msg) => {
        try {
            const data = JSON.parse(msg);

            // Weiterleiten aller WebRTC-Nachrichten an andere Clients
            if (['offer', 'answer', 'candidate', 'hangup'].includes(data.type)) {
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify(data));
                    }
                });
            }
        } catch (err) {
            console.error('Fehler beim Parsen:', err);
        }
    });

    ws.on('close', () => {
        onlineCount--;
        broadcastOnlineCount(); // direkt beim Trennen
    });
});
