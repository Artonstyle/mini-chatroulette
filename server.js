const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// statische Dateien aus /public
app.use(express.static('public'));

// Warteschlange für Matching (Eintrag: { socketId, profile })
const waiting = [];
// Paare: socketId -> peerSocketId
const pairs = new Map();

function updateOnlineCount() {
  io.emit('onlineCount', io.engine.clientsCount || 0);
}

function isCompatible(a, b) {
  if (!a || !b) return false;
  if (a.profile && b.profile) {
    const A = a.profile;
    const B = b.profile;
    const genderMatch = (A.gender === B.search) && (B.gender === A.search);
    const countryMatch = (!A.country || !B.country) || (A.country === B.country);
    return genderMatch && countryMatch;
  }
  return false;
}

function tryMatch(waitingEntry) {
  for (let i = 0; i < waiting.length; i++) {
    const other = waiting[i];
    if (other.socketId === waitingEntry.socketId) continue;
    if (isCompatible(waitingEntry, other)) {
      const idxA = waiting.findIndex(w => w.socketId === waitingEntry.socketId);
      const idxB = waiting.findIndex(w => w.socketId === other.socketId);
      const high = Math.max(idxA, idxB), low = Math.min(idxA, idxB);
      if (high >= 0) waiting.splice(high, 1);
      if (low >= 0) waiting.splice(low, 1);

      pairs.set(waitingEntry.socketId, other.socketId);
      pairs.set(other.socketId, waitingEntry.socketId);

      const initiator = Math.random() < 0.5 ? waitingEntry.socketId : other.socketId;
      const responder = initiator === waitingEntry.socketId ? other.socketId : waitingEntry.socketId;

      io.to(initiator).emit('matched', { peerId: responder, initiator: true });
      io.to(responder).emit('matched', { peerId: initiator, initiator: false });

      return true;
    }
  }
  return false;
}

io.on('connection', (socket) => {
  console.log('conn:', socket.id);
  updateOnlineCount();

  socket.on('join', (profile) => {
    console.log('join from', socket.id, profile);
    const prevIdx = waiting.findIndex(w => w.socketId === socket.id);
    if (prevIdx >= 0) waiting.splice(prevIdx, 1);
    waiting.push({ socketId: socket.id, profile });
    const entry = waiting.find(w => w.socketId === socket.id);
    if (!tryMatch(entry)) {
      io.to(socket.id).emit('waiting');
    }
  });

  socket.on('leave', () => {
    console.log('leave', socket.id);
    const peer = pairs.get(socket.id);
    if (peer) {
      pairs.delete(peer);
      pairs.delete(socket.id);
      io.to(peer).emit('peerDisconnected');
    }
    const idx = waiting.findIndex(w => w.socketId === socket.id);
    if (idx >= 0) waiting.splice(idx, 1);
    updateOnlineCount();
  });

  socket.on('next', (profile) => {
    console.log('next from', socket.id);
    const currentPeer = pairs.get(socket.id);
    if (currentPeer) {
      pairs.delete(currentPeer);
      pairs.delete(socket.id);
      io.to(currentPeer).emit('peerDisconnected');
    }
    const oldIdx = waiting.findIndex(w => w.socketId === socket.id);
    if (oldIdx >= 0) waiting.splice(oldIdx, 1);
    waiting.push({ socketId: socket.id, profile });
    const entry = waiting.find(w => w.socketId === socket.id);
    if (!tryMatch(entry)) {
      io.to(socket.id).emit('waiting');
    }
    updateOnlineCount();
  });

  socket.on('signal', ({ to, data }) => {
    if (!to) return;
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('chat', ({ to, message }) => {
    if (!to || !message) return;
    io.to(to).emit('chat', { from: socket.id, message });
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    const idx = waiting.findIndex(w => w.socketId === socket.id);
    if (idx >= 0) waiting.splice(idx, 1);
    const peer = pairs.get(socket.id);
    if (peer) {
      pairs.delete(peer);
      pairs.delete(socket.id);
      io.to(peer).emit('peerDisconnected');
    }
    updateOnlineCount();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('Server listening on', PORT);
});
