// server/mother/sse-streaming-hub.ts
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Request, Response } from 'express';
import { createLogger } from '../_core/logger';

const logger = createLogger('sse-streaming-hub');

export const MOTHER_DIR = existsSync('/app/server')
  ? '/app'
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type Channel = 'chat' | 'shell' | 'tool-use' | 'codegen' | 'system';

interface SSEPayload {
  channel: Channel;
  type: string;
  content: any;
  timestamp: number;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

const eventEmitter = new EventEmitter();

// Map clientId => Response
const clients = new Map<string, Response>();

function sendSSE(res: Response, payload: SSEPayload) {
  try {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    res.write(data);
  } catch (err) {
    logger.error('Failed to send SSE data', err);
  }
}

function heartbeat() {
  const timestamp = Date.now();
  const heartbeatPayload: SSEPayload = {
    channel: 'system',
    type: 'heartbeat',
    content: 'ping',
    timestamp,
  };
  for (const res of clients.values()) {
    sendSSE(res, heartbeatPayload);
  }
}

let heartbeatTimer: NodeJS.Timeout | null = null;

function startHeartbeat() {
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
    logger.debug('SSE heartbeat started');
  }
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    logger.debug('SSE heartbeat stopped');
  }
}

function generateClientId(): string {
  // Simple unique id generation for client
  return `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

export function handleSSEHub(req: Request, res: Response) {
  // Only allow GET method
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  // Setup SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const clientId = generateClientId();
  clients.set(clientId, res);
  logger.info(`SSE client connected: ${clientId} | total clients: ${clients.size}`);

  // Send initial connected event
  sendSSE(res, {
    channel: 'system',
    type: 'connected',
    content: { clientId },
    timestamp: Date.now(),
  });

  // Start heartbeat if first client
  if (clients.size === 1) {
    startHeartbeat();
  }

  // Listener for broadcast events
  const onEvent = (payload: SSEPayload) => {
    // Each client receives all events
    sendSSE(res, payload);
  };

  eventEmitter.on('broadcast', onEvent);

  // Handle client disconnect
  const onClose = () => {
    eventEmitter.off('broadcast', onEvent);
    clients.delete(clientId);
    logger.info(`SSE client disconnected: ${clientId} | total clients: ${clients.size}`);
    if (clients.size === 0) {
      stopHeartbeat();
    }
  };

  req.on('close', onClose);
  req.on('end', onClose);
}

export function broadcastToHub(channel: Channel, type: string, content: any) {
  const payload: SSEPayload = {
    channel,
    type,
    content,
    timestamp: Date.now(),
  };
  eventEmitter.emit('broadcast', payload);
  logger.debug(`Broadcast event: ${channel} | ${type}`);
}

export function getConnectedClients(): Map<string, Response> {
  return clients;
}