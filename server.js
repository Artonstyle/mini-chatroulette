const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Array für alle verbundenen Clients
let clients = [];

wss.on('connection', (ws) => {
  console.log("Neuer Client verbunden ✅");
  clients.push(ws);

  ws.on('message', (message) => {
    // Nachricht an alle anderen Clients weiterleiten
    clients.forEach(client => {
      if (client !== ws && client.readyState === client.OPEN) {
        client.send(message.toString());
      }
    });
  });

  ws.on('close', () => {
    console.log("Client getrennt ❌");
    clients = clients.filter(c => c !== ws);
  });

  ws.on('error', (err) => {
    console.error("WebSocket Fehler:", err);
  });
});

// Statische Dateien aus public/ bereitstellen
app.use(express.static(path.join(__dirname, 'public')));

// Server starten
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server läuft auf Port ${PORT}`);
});
