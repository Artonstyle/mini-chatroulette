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
const adminMessages = [];
const bannedAddresses = new Set();
const blockedAddresses = new Map();
const adminSessions = new Map();
const geoCache = new Map();
const locationCache = new Map();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "miniadmin123";
const ADMIN_SESSION_TTL_MS = 1000 * 60 * 60 * 12;
let nextClientId = 1;
let nextReportId = 1;
let nextAdminMessageId = 1;

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
        https.get(url, {
            headers: {
                "User-Agent": "MiniChatroulette/1.0 (admin@mini-chatroulette.local)",
                "Accept": "application/json"
            }
        }, (res) => {
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

function toRadians(value) {
    return (value * Math.PI) / 180;
}

function calculateDistanceKm(firstCoords, secondCoords) {
    if (!firstCoords || !secondCoords) return null;

    const earthRadiusKm = 6371;
    const deltaLat = toRadians(secondCoords.lat - firstCoords.lat);
    const deltaLon = toRadians(secondCoords.lon - firstCoords.lon);
    const lat1 = toRadians(firstCoords.lat);
    const lat2 = toRadians(secondCoords.lat);

    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(earthRadiusKm * c);
}

async function geocodeLocationText(rawLocation) {
    const location = String(rawLocation || "").trim();
    if (!location) return null;

    const cacheKey = location.toLowerCase();
    if (locationCache.has(cacheKey)) {
        return locationCache.get(cacheKey);
    }

    try {
        const results = await httpsJson(
            `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=de&q=${encodeURIComponent(location)}`
        );

        const first = Array.isArray(results) ? results[0] : null;
        if (!first) {
            locationCache.set(cacheKey, null);
            return null;
        }

        const normalized = {
            label: first.display_name || location,
            lat: Number(first.lat),
            lon: Number(first.lon)
        };

        locationCache.set(cacheKey, normalized);
        return normalized;
    } catch (_) {
        return null;
    }
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
            const data = await httpsJson(`https://ipwho.is/${encodeURIComponent(ip)}?fields=country,region,city,connection`);
            info = {
                country: data.country || "Unbekannt",
                region: data.region || "-",
                city: data.city || "-",
                asn: data.connection?.isp || data.connection?.org || data.connection?.asn || "-"
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

function isOpen(ws) {
    return ws && ws.readyState === WebSocket.OPEN;
}

function sendJson(ws, payload) {
    if (!isOpen(ws)) return false;
    ws.send(JSON.stringify(payload));
    return true;
}

function parseIncomingMessage(rawMessage) {
    try {
        return JSON.parse(rawMessage);
    } catch (_) {
        return null;
    }
}

function cleanupAdminSessions() {
    const now = Date.now();

    for (const [token, createdAt] of adminSessions.entries()) {
        if (now - createdAt > ADMIN_SESSION_TTL_MS) {
            adminSessions.delete(token);
        }
    }
}

function requireAdmin(req, res, next) {
    cleanupAdminSessions();
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
        bans: Array.from(bannedAddresses),
        adminMessages: adminMessages.slice(-50).reverse()
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
    const safeGender = data.gender === "female" ? "female" : "male";
    const safeSearch = data.search === "male" || data.search === "female" ? data.search : "female";
    const safeCountry = typeof data.country === "string" && data.country.trim()
        ? data.country.trim()
        : "all";
    const safeLocationText = String(data.locationText || "").trim().slice(0, 120);

    return {
        gender: safeGender,
        search: safeSearch,
        country: safeCountry,
        locationText: safeLocationText,
        location: null
    };
}

function getPublicProfile(profile) {
    if (!profile) {
        return { gender: "unknown", country: "Unbekannt", locationLabel: "" };
    }

    return {
        gender: profile.gender || "unknown",
        country: profile.country && profile.country !== "all" ? profile.country : "Unbekannt",
        locationLabel: profile.location?.label || profile.locationText || ""
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
    return false;
}

function findWaitingMatch(ws) {
    for (const candidate of waitingClients) {
        if (candidate === ws || candidate.readyState !== WebSocket.OPEN) continue;

        if (strictlyMatches(ws, candidate)) {
            return candidate;
        }
    }

    return null;
}

function matchClients(firstWs, secondWs) {
    removeFromWaiting(firstWs);
    removeFromWaiting(secondWs);

    pairs.set(firstWs, secondWs);
    pairs.set(secondWs, firstWs);

    const firstProfile = profiles.get(firstWs);
    const secondProfile = profiles.get(secondWs);
    const distanceKm = calculateDistanceKm(firstProfile?.location, secondProfile?.location);

    firstWs.send(JSON.stringify({
        type: "matched",
        should_offer: true,
        partner: getPublicProfile(secondProfile),
        distanceKm
    }));
    secondWs.send(JSON.stringify({
        type: "matched",
        should_offer: false,
        partner: getPublicProfile(firstProfile),
        distanceKm
    }));
}

function releaseClient(ws, notifyPartner = true) {
    removeFromWaiting(ws);

    const partner = pairs.get(ws);
    if (!partner) return;

    pairs.delete(ws);
    pairs.delete(partner);

    if (notifyPartner && isOpen(partner)) {
        sendJson(partner, { type: "partner-left" });
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
            sendJson(client, { type: "banned" });
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

app.post("/admin/logout", requireAdmin, (req, res) => {
    const token = req.headers["x-admin-token"];
    adminSessions.delete(token);
    res.json({ ok: true });
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
    const messageText = String(text || "").trim();

    if (!targetClient || !isOpen(targetClient)) {
        return res.status(404).json({ ok: false, error: "Nutzer nicht gefunden" });
    }

    if (!messageText) {
        return res.status(400).json({ ok: false, error: "Keine Nachricht angegeben" });
    }

    const adminMessage = {
        id: nextAdminMessageId++,
        createdAt: new Date().toISOString(),
        clientId: targetClient.clientId,
        address: targetClient.clientAddress,
        text: messageText
    };

    adminMessages.push(adminMessage);

    sendJson(targetClient, {
        type: "admin-message",
        text: messageText
    });

    res.json({ ok: true, message: adminMessage });
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
        sendJson(ws, { type: "banned" });
        ws.close();
        return;
    }

    console.log("Neuer Client verbunden");
    broadcastUserCount();

    ws.on("message", async (msg) => {
        const data = parseIncomingMessage(msg);

        if (!data || typeof data.type !== "string") {
            sendJson(ws, { type: "error", message: "Ungültige Nachricht." });
            return;
        }

        if (data.type === "start") {
            const profile = normalizeProfile(data);
            if (profile.locationText) {
                profile.location = await geocodeLocationText(profile.locationText);
            }

            profiles.set(ws, profile);
            releaseClient(ws, false);
            removeFromWaiting(ws);

            const partner = findWaitingMatch(ws);

            if (partner) {
                matchClients(ws, partner);
            } else {
                waitingClients.push(ws);
                sendJson(ws, { type: "no-match" });
            }
        } else if (data.type === "next" || data.type === "stop") {
            releaseClient(ws, true);

            if (data.type === "stop") {
                removeFromWaiting(ws);
            }
        } else if (data.type === "report") {
            const partner = pairs.get(ws);
            const reason = String(data.reason || "Unangemessenes Verhalten").trim().slice(0, 120);
            const details = String(data.details || "").trim().slice(0, 1000);
            const report = {
                id: nextReportId++,
                createdAt: new Date().toISOString(),
                reporterId: ws.clientId,
                reporterAddress: ws.clientAddress,
                targetId: partner?.clientId || null,
                targetAddress: partner?.clientAddress || null,
                partner: getPublicProfile(profiles.get(partner)),
                reason,
                details
            };

            reports.push(report);

            sendJson(ws, { type: "report-saved" });
        } else if (data.type === "block") {
            const partner = pairs.get(ws);

            if (partner) {
                addMutualBlock(ws.clientAddress, partner.clientAddress);
                releaseClient(ws, true);

                sendJson(ws, { type: "blocked" });
            }
        } else if (["offer", "answer", "candidate"].includes(data.type)) {
            const partner = pairs.get(ws);
            if (isOpen(partner)) {
                sendJson(partner, data);
            }
        } else {
            sendJson(ws, { type: "error", message: `Unbekannter Nachrichtentyp: ${data.type}` });
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
