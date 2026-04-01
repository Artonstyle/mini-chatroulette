const http = require("http");
const https = require("https");
const WebSocket = require("ws");
const express = require("express");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static("public"));

const waitingClients = [];
const pairs = new Map();
const profiles = new Map();
const reports = [];
const bannedAddresses = new Set();
const blockedAddresses = new Map();
const adminSessions = new Map();
const geoCache = new Map();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "miniadmin123";
let nextClientId = 1;
let nextReportId = 1;

function getClientAddress(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
        return forwarded.split(",")[0].trim();
    }

    return req.socket.remoteAddress || "unbekannt";
}

function normalizeIp(address) {
    if (!address) return "unbekannt";
    if (address.startsWith("::ffff:")) {
        return address.slice(7);
    }
    return address;
}

function isPrivateIp(address) {
    if (!address || address === "unbekannt") return true;

    return (
        address === "::1" ||
        address === "127.0.0.1" ||
        address.startsWith("10.") ||
        address.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(address) ||
        address.startsWith("fc") ||
        address.startsWith("fd")
    );
}

function httpsJson(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let raw = "";
            res.on("data", (chunk) => {
                raw += chunk;
            });
            res.on("end", () => {
                try {
                    resolve(JSON.parse(raw));
                } catch (error) {
                    reject(error);
                }
            });
        }).on("error", reject);
    });
}

async function lookupGeoInfo(address) {
    const ip = normalizeIp(address);

    if (geoCache.has(ip)) {
        return geoCache.get(ip);
    }

    let info;

    if (isPrivateIp(ip)) {
        info = {
            country: "Lokal / Unbekannt",
            region: "-",
            city: "-",
            asn: "-"
        };
    } else {
        try {
            const data = await httpsJson(`https://api.country.is/${encodeURIComponent(ip)}?fields=country,city,subdivision,asn`);
            info = {
                country: data.country || "Unbekannt",
                region: data.subdivision || "-",
                city: data.city || "-",
                asn: data.asn?.name || data.asn?.asn || "-"
            };
        } catch (_) {
            info = {
                country: "Unbekannt",
                region: "-",
                city: "-",
                asn: "-"
            };
        }
    }

    geoCache.set(ip, info);
    return info;
}

function createAdminToken() {
    return crypto.randomBytes(24).toString("hex");
}

function requireAdmin(req, res, next) {
    const token = req.headers["x-admin-token"];

    if (!token || !adminSessions.has(token)) {
        return res.status(401).json({ ok: false, error: "Nicht autorisiert" });
    }

    next();
}

function getClientState(ws) {
    if (pairs.has(ws)) return "verbunden";
    if (waitingClients.includes(ws)) return "wartet";
    return "bereit";
}

function addMutualBlock(firstAddress, secondAddress) {
    if (!firstAddress || !secondAddress || firstAddress === secondAddress) return;

    if (!blockedAddresses.has(firstAddress)) {
        blockedAddresses.set(firstAddress, new Set());
    }

    if (!blockedAddresses.has(secondAddress)) {
        blockedAddresses.set(secondAddress, new Set());
    }

    blockedAddresses.get(firstAddress).add(secondAddress);
    blockedAddresses.get(secondAddress).add(firstAddress);
}

function isBlocked(firstWs, secondWs) {
    const firstAddress = firstWs?.clientAddress;
    const secondAddress = secondWs?.clientAddress;

    if (!firstAddress || !secondAddress) return false;

    return (
        blockedAddresses.get(firstAddress)?.has(secondAddress) ||
        blockedAddresses.get(secondAddress)?.has(firstAddress) ||
        false
    );
}

function collectAdminOverview() {
    const users = Array.from(wss.clients)
        .filter((client) => client.readyState === WebSocket.OPEN)
        .map((client) => {
            const partner = pairs.get(client);
            const profile = profiles.get(client);

            return {
                id: client.clientId,
                address: client.clientAddress,
                geo: client.geo || {
                    country: "Lädt...",
                    region: "-",
                    city: "-",
                    asn: "-"
                },
                connectedAt: client.connectedAt,
                state: getClientState(client),
                partnerId: partner?.clientId || null,
                partnerAddress: partner?.clientAddress || null,
                gender: profile?.gender || "unknown",
                search: profile?.search || "unknown",
                country: profile?.country || "all"
            };
        });

    const uniquePairs = [];
    const seen = new Set();

    pairs.forEach((partner, client) => {
        const key = [client.clientId, partner.clientId].sort((a, b) => a - b).join(":");
        if (seen.has(key)) return;
        seen.add(key);
        uniquePairs.push({
            firstId: client.clientId,
            secondId: partner.clientId
        });
    });

    return {
        stats: {
            online: users.length,
            waiting: waitingClients.filter((client) => client.readyState === WebSocket.OPEN).length,
            connectedPairs: uniquePairs.length,
            reports: reports.length,
            bans: bannedAddresses.size
        },
        users,
        pairs: uniquePairs,
        reports: reports.slice().reverse(),
        bans: Array.from(bannedAddresses)
    };
}

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
    if (isBlocked(firstWs, secondWs)) return false;

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
    if (isBlocked(firstWs, secondWs)) return false;

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

function banClientByAddress(address) {
    if (!address) return;

    bannedAddresses.add(address);

    Array.from(wss.clients).forEach((client) => {
        if (client.clientAddress !== address) return;

        releaseClient(client, true);
        removeFromWaiting(client);
        profiles.delete(client);

        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: "banned" }));
            client.close();
        }
    });
}

app.post("/admin/login", (req, res) => {
    const password = req.body?.password;

    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ ok: false, error: "Falsches Passwort" });
    }

    const token = createAdminToken();
    adminSessions.set(token, Date.now());
    res.json({ ok: true, token });
});

app.get("/admin/overview", requireAdmin, (req, res) => {
    res.json({ ok: true, ...collectAdminOverview() });
});

app.post("/admin/ban", requireAdmin, (req, res) => {
    const { clientId, address } = req.body || {};
    let targetAddress = address;

    if (!targetAddress && clientId) {
        const targetClient = Array.from(wss.clients).find((client) => client.clientId === Number(clientId));
        targetAddress = targetClient?.clientAddress;
    }

    if (!targetAddress) {
        return res.status(400).json({ ok: false, error: "Kein Nutzer gefunden" });
    }

    banClientByAddress(targetAddress);
    broadcastUserCount();
    res.json({ ok: true });
});

app.post("/admin/unban", requireAdmin, (req, res) => {
    const { address } = req.body || {};

    if (!address) {
        return res.status(400).json({ ok: false, error: "Keine Adresse angegeben" });
    }

    bannedAddresses.delete(address);
    res.json({ ok: true });
});

app.post("/admin/disconnect", requireAdmin, (req, res) => {
    const { clientId } = req.body || {};
    const targetClient = Array.from(wss.clients).find((client) => client.clientId === Number(clientId));

    if (!targetClient) {
        return res.status(404).json({ ok: false, error: "Nutzer nicht gefunden" });
    }

    releaseClient(targetClient, true);
    removeFromWaiting(targetClient);

    if (targetClient.readyState === WebSocket.OPEN) {
        targetClient.send(JSON.stringify({ type: "partner-left" }));
    }

    broadcastUserCount();
    res.json({ ok: true });
});

app.post("/admin/message", requireAdmin, (req, res) => {
    const { clientId, text } = req.body || {};
    const targetClient = Array.from(wss.clients).find((client) => client.clientId === Number(clientId));

    if (!targetClient || targetClient.readyState !== WebSocket.OPEN) {
        return res.status(404).json({ ok: false, error: "Nutzer nicht gefunden" });
    }

    if (!text || !String(text).trim()) {
        return res.status(400).json({ ok: false, error: "Keine Nachricht angegeben" });
    }

    targetClient.send(JSON.stringify({
        type: "admin-message",
        text: String(text).trim()
    }));

    res.json({ ok: true });
});

wss.on("connection", (ws, req) => {
    ws.clientId = nextClientId++;
    ws.clientAddress = normalizeIp(getClientAddress(req));
    ws.connectedAt = new Date().toISOString();
    ws.geo = {
        country: "Lädt...",
        region: "-",
        city: "-",
        asn: "-"
    };

    lookupGeoInfo(ws.clientAddress)
        .then((geo) => {
            ws.geo = geo;
        })
        .catch(() => {});

    if (bannedAddresses.has(ws.clientAddress)) {
        ws.close();
        return;
    }

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
        } else if (data.type === "report") {
            const partner = pairs.get(ws);
            const report = {
                id: nextReportId++,
                createdAt: new Date().toISOString(),
                reporterId: ws.clientId,
                reporterAddress: ws.clientAddress,
                targetId: partner?.clientId || null,
                targetAddress: partner?.clientAddress || null,
                partner: getPublicProfile(profiles.get(partner)),
                reason: data.reason || "Unangemessenes Verhalten",
                details: data.details || ""
            };

            reports.push(report);

            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "report-saved" }));
            }
        } else if (data.type === "block") {
            const partner = pairs.get(ws);

            if (partner) {
                addMutualBlock(ws.clientAddress, partner.clientAddress);
                releaseClient(ws, true);

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: "blocked" }));
                }
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
