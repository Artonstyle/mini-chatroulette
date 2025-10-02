const http = require("http");
const WebSocket = require("ws");
const express = require("express");
const fs = require("fs");
const path = require("path"); 
// ... weitere requires

const app = express();

// NEU: Hinzufügen des CSP-Headers zur Erlaubnis von Favicon und statischen Assets
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
  );
  next();
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Korrigiert: Statische Dateien aus dem aktuellen Verzeichnis bereitstellen
app.use(express.static(path.join(__dirname, '/'))); 

// ... der Rest deines Codes folgt hier
