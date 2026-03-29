const http = require("http");
const WebSocket = require("ws");
const express = require("express");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

const waitingUsers = [];
const pairs = new Map();
const profiles = new Map();

const HEARTBEAT_INTERVAL_MS = 30000;

function broadcastUserCount() {
    const count = wss.clients.size;
    const message = JSON.stringify({ type: "user-count", count });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function removeFromWaiting(ws) {
    const index = waitingUsers.indexOf(ws);
    if (index !== -1) {
        waitingUsers.splice(index, 1);
    }
}

function getProfile(ws) {
    return profiles.get(ws) || {
        gender: "",
        search: "",
        country: ""
    };
}

function isCountryMatch(a, b) {
    if (a.country === "all" || b.country === "all") {
        return true;
    }
    return a.country === b.country;
}

function isGenderMatch(a, b) {
    return a.search === b.gender && b.search === a.gender;
}

function canMatch(wsA, wsB) {
    const a = getProfile(wsA);
    const b = getProfile(wsB);

    if (!a.gender || !a.search || !a.country) return false;
    if (!b.gender || !b.search || !b.country) return false;

    return isGenderMatch(a, b) && isCountryMatch(a, b);
}

function tryMatch(ws) {
    if (waitingUsers.length === 0) {
        waitingUsers.push(ws);
        ws.send(JSON.stringify({ type: "no-match" }));
        return;
    }

    for (let i = 0; i < waitingUsers.length; i++) {
        const other = waitingUsers[i];

        if (other === ws) continue;
        if (other.readyState !== WebSocket.OPEN) continue;

        if (canMatch(ws, other)) {
            waitingUsers.splice(i, 1);

            pairs.set(ws, other);
            pairs.set(other, ws);

            ws.send(JSON.stringify({ type: "matched", should_offer: true }));
            other.send(JSON.stringify({ type: "matched", should_offer: false }));
            return;
        }
    }

    waitingUsers.push(ws);
    ws.send(JSON.stringify({ type: "no-match" }));
}

function disconnectPair(ws, notifyPartner = true) {
    const partner = pairs.get(ws);

    if (partner) {
        pairs.delete(ws);
        pairs.delete(partner);

        if (notifyPartner && partner.readyState === WebSocket.OPEN) {
            partner.send(JSON.stringify({ type: "partner-left" }));
        }
    }
}

function markAlive(ws) {
    ws.isAlive = true;
    ws.lastPingAt = Date.now();
}

wss.on("connection", (ws) => {
    console.log("🔗 Neuer Client verbunden");

    markAlive(ws);
    broadcastUserCount();

    ws.on("message", (msg) => {
        let data;

        try {
            data = JSON.parse(msg);
        } catch (err) {
            console.warn("Ungültige JSON Nachricht:", err);
            return;
        }

        if (data.type === "ping") {
            markAlive(ws);
            ws.send(JSON.stringify({
                type: "pong",
                ts: Date.now()
            }));
            return;
        }

        if (data.type === "start") {
            removeFromWaiting(ws);
            disconnectPair(ws, false);

            profiles.set(ws, {
                gender: data.gender || "",
                search: data.search || "",
                country: data.country || ""
            });

            tryMatch(ws);
        }

        else if (data.type === "next") {
            removeFromWaiting(ws);
            disconnectPair(ws, true);
        }

        else if (data.type === "stop") {
            removeFromWaiting(ws);
            disconnectPair(ws, true);
        }

        else if (["offer", "answer", "candidate"].includes(data.type)) {
            const partner = pairs.get(ws);

            if (partner && partner.readyState === WebSocket.OPEN) {
                partner.send(JSON.stringify(data));
            }
        }
    });

    ws.on("close", () => {
        console.log("🔗 Client getrennt");

        removeFromWaiting(ws);
        disconnectPair(ws, true);
        profiles.delete(ws);

        broadcastUserCount();
    });

    ws.on("error", (err) => {
        console.warn("WebSocket Fehler:", err.message);

        removeFromWaiting(ws);
        disconnectPair(ws, true);
        profiles.delete(ws);
    });
});

const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.readyState !== WebSocket.OPEN) return;

        if (!ws.isAlive) {
            console.warn("💔 Heartbeat Timeout – Verbindung wird beendet");
            ws.terminate();
            return;
        }

        ws.isAlive = false;

        try {
            ws.send(JSON.stringify({
                type: "server-ping",
                ts: Date.now()
            }));
        } catch (err) {
            console.warn("Fehler beim Server-Heartbeat:", err.message);
        }
    });
}, HEARTBEAT_INTERVAL_MS);

wss.on("close", () => {
    clearInterval(heartbeatTimer);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Signalisierungsserver läuft auf Port ${PORT}`);
});
