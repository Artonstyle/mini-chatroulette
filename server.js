const http = require("http");
const WebSocket = require("ws");
const express = require("express");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static("public"));

const waitingClients = [];
const pairs = new Map();
const profiles = new Map();

function broadcastUserCount() {
    const count = wss.clients.size;
    const message = JSON.stringify({ type: "user-count", count });

    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function normalizeProfile(data = {}) {
    return {
        gender: data.gender || "male",
        search: data.search || "female",
        country: data.country || "all"
    };
}

function getPublicProfile(profile) {
    if (!profile) {
        return { gender: "unknown", country: "Unbekannt" };
    }

    return {
        gender: profile.gender || "unknown",
        country: profile.country && profile.country !== "all" ? profile.country : "Unbekannt"
    };
}

function removeFromWaiting(ws) {
    const index = waitingClients.indexOf(ws);
    if (index !== -1) {
        waitingClients.splice(index, 1);
    }
}

function countriesCompatible(firstProfile, secondProfile) {
    if (!firstProfile || !secondProfile) return true;

    const firstCountry = firstProfile.country || "all";
    const secondCountry = secondProfile.country || "all";

    return (
        firstCountry === "all" ||
        secondCountry === "all" ||
        firstCountry === secondCountry
    );
}

function strictlyMatches(firstWs, secondWs) {
    const firstProfile = profiles.get(firstWs);
    const secondProfile = profiles.get(secondWs);

    if (!firstProfile || !secondProfile) return false;

    return (
        firstProfile.search === secondProfile.gender &&
        secondProfile.search === firstProfile.gender &&
        countriesCompatible(firstProfile, secondProfile)
    );
}

function canFallbackMatch(firstWs, secondWs) {
    const firstProfile = profiles.get(firstWs);
    const secondProfile = profiles.get(secondWs);

    if (!firstProfile || !secondProfile) return false;

    return countriesCompatible(firstProfile, secondProfile);
}

function findWaitingMatch(ws) {
    let fallback = null;

    for (const candidate of waitingClients) {
        if (candidate === ws || candidate.readyState !== WebSocket.OPEN) continue;

        if (strictlyMatches(ws, candidate)) {
            return candidate;
        }

        if (!fallback && canFallbackMatch(ws, candidate)) {
            fallback = candidate;
        }
    }

    return fallback;
}

function matchClients(firstWs, secondWs) {
    removeFromWaiting(firstWs);
    removeFromWaiting(secondWs);

    pairs.set(firstWs, secondWs);
    pairs.set(secondWs, firstWs);

    firstWs.send(JSON.stringify({
        type: "matched",
        should_offer: true,
        partner: getPublicProfile(profiles.get(secondWs))
    }));
    secondWs.send(JSON.stringify({
        type: "matched",
        should_offer: false,
        partner: getPublicProfile(profiles.get(firstWs))
    }));
}

function releaseClient(ws, notifyPartner = true) {
    removeFromWaiting(ws);

    const partner = pairs.get(ws);
    if (!partner) return;

    pairs.delete(ws);
    pairs.delete(partner);

    if (notifyPartner && partner.readyState === WebSocket.OPEN) {
        partner.send(JSON.stringify({ type: "partner-left" }));
    }
}

wss.on("connection", (ws) => {
    console.log("Neuer Client verbunden");
    broadcastUserCount();

    ws.on("message", (msg) => {
        const data = JSON.parse(msg);

        if (data.type === "start") {
            profiles.set(ws, normalizeProfile(data));
            releaseClient(ws, false);
            removeFromWaiting(ws);

            const partner = findWaitingMatch(ws);

            if (partner) {
                matchClients(ws, partner);
            } else {
                waitingClients.push(ws);
                ws.send(JSON.stringify({ type: "no-match" }));
            }
        } else if (data.type === "next" || data.type === "stop") {
            releaseClient(ws, true);

            if (data.type === "stop") {
                removeFromWaiting(ws);
            }
        } else if (["offer", "answer", "candidate"].includes(data.type)) {
            const partner = pairs.get(ws);
            if (partner && partner.readyState === WebSocket.OPEN) {
                partner.send(JSON.stringify(data));
            }
        }
    });

    ws.on("close", () => {
        console.log("Client getrennt");
        releaseClient(ws, true);
        removeFromWaiting(ws);
        profiles.delete(ws);
        broadcastUserCount();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Signalisierungsserver läuft auf Port ${PORT}`));
