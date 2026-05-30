// =============================================================================
// WebSocket Service - Real-time Data
// =============================================================================

const logger = require('../utils/logger');

let wss = null;
const clients = new Map(); // clientId -> { ws, subscriptions }

function setupWebSocket(wsServer) {
  wss = wsServer;

  wss.on('connection', (ws, req) => {
    const clientId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    clients.set(clientId, { ws, subscriptions: new Set(['stats']) });

    logger.debug(`WebSocket client connected: ${clientId}`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(clientId, message);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      clients.delete(clientId);
      logger.debug(`WebSocket client disconnected: ${clientId}`);
    });

    ws.on('error', (err) => {
      logger.warn(`WebSocket error for ${clientId}:`, err.message);
      clients.delete(clientId);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      clientId,
      timestamp: new Date().toISOString()
    }));
  });
}

function handleClientMessage(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (message.type) {
    case 'subscribe':
      if (message.channel) {
        client.subscriptions.add(message.channel);
      }
      break;

    case 'unsubscribe':
      if (message.channel) {
        client.subscriptions.delete(message.channel);
      }
      break;

    case 'ping':
      client.ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
  }
}

// Broadcast to all connected clients
function broadcast(type, data) {
  if (!wss) return;

  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });

  clients.forEach((client) => {
    if (client.ws.readyState === 1 && client.subscriptions.has(type)) {
      try {
        client.ws.send(message);
      } catch (err) {
        logger.warn('Failed to send WS message:', err.message);
      }
    }
  });
}

// Broadcast to specific channel subscribers
function broadcastToChannel(channel, data) {
  broadcast(channel, data);
}

// Send to specific client
function sendToClient(clientId, type, data) {
  const client = clients.get(clientId);
  if (client && client.ws.readyState === 1) {
    client.ws.send(JSON.stringify({ type, data, timestamp: new Date().toISOString() }));
  }
}

// Get connected client count
function getClientCount() {
  return clients.size;
}

module.exports = {
  setupWebSocket,
  broadcast,
  broadcastToChannel,
  sendToClient,
  getClientCount
};
