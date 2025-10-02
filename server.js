const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const fs = require("fs");
const path = require("path"); 
const auth = require('basic-auth'); // Benötigt für Basic Authentication

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Statische Dateien (z.B. index.html, client.js, style.css)
app.use(express.static(path.join(__dirname, '/'))); 

let waiting = null; 
const pairs = new Map(); 
const reportsFile = "reports.log";

// Funktion zum Senden der Userzahl
function broadcastUserCount() {
    const count = wss.clients.size;
    const message = JSON.stringify({ type: "user-count", count });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
    });
}

// Reports speichern
function logReport(ws) {
    const ip = ws._socket.remoteAddress;
    const entry = `${new Date().toISOString()} - Report gegen IP: ${ip}\n`;
    fs.appendFileSync(reportsFile, entry);
    console.log("⚠️ Report gespeichert:", entry.trim());
}

wss.on("connection", (ws) => {
    console.log("🔗 Neuer Client");
    broadcastUserCount();

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        if (data.type === "start") {
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
                ws.send(JSON.stringify({ type: "no-match" }));
            }
        }

        else if (data.type === "next" || data.type === "stop") {
            const partner = pairs.get(ws);
            if (partner) {
                pairs.delete(ws);
                pairs.delete(partner);
                partner.send(JSON.stringify({ type: "partner-left" }));
            }
            if (data.type === "stop" && waiting === ws) waiting = null;
        }

        else if (["offer", "answer", "candidate"].includes(data.type)) {
            const partner = pairs.get(ws);
            if (partner && partner.readyState === WebSocket.OPEN) {
                partner.send(JSON.stringify(data));
            }
        }

        else if (data.type === "report") {
            logReport(ws);
            const partner = pairs.get(ws);
            if (partner) {
                // Korrektur: Partner wird nach Report getrennt
                partner.send(JSON.stringify({ type: "partner-left" })); 
                partner.send(JSON.stringify({ type: "system", message: "⚠️ Du wurdest gemeldet und getrennt." }));
                pairs.delete(ws); 
                pairs.delete(partner); 
            }
        }
    });

    ws.on("close", () => {
        console.log("🔗 Client getrennt");
        const partner = pairs.get(ws);
        if (partner) {
            pairs.delete(ws);
            pairs.delete(partner);
            if (partner.readyState === WebSocket.OPEN) {
                partner.send(JSON.stringify({ type: "partner-left" }));
            }
        }
        if (waiting === ws) waiting = null;
        broadcastUserCount();
    });
});

// **********************************************
// ADMIN-BEREICH
// **********************************************

const adminCredentials = {
  username: 'admin',
  password: 'Arton.190388' // ⚠️ SICHERES PASSWORT VERWENDEN
};

// 1. Middleware zur Absicherung des /admin Pfades (Basic Auth)
app.use('/admin', (req, res, next) => {
  const user = auth(req);
  if (!user || user.name !== adminCredentials.username || user.pass !== adminCredentials.password) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Area"');
    return res.status(401).send('Zugang verweigert');
  }
  next();
});

// 2. Admin Dashboard anzeigen
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

// 3. Endpunkt, um die Reports zu laden
app.get("/admin/reports", (req, res) => {
    const reportsPath = path.join(__dirname, "reports.log");
    
    if (fs.existsSync(reportsPath)) {
        res.sendFile(reportsPath); 
    } else {
        res.type('text/plain').send("Noch keine Reports vorhanden.");
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
