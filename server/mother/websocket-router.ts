// server/mother/websocket-router.ts
import http from 'http';
import net from 'net';
import { Duplex } from 'stream';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createLogger } from '../_core/logger';

const logger = createLogger('websocket-router');

export const MOTHER_DIR = existsSync('/app/server')
  ? '/app'
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

type WSMessageType = 'shell' | 'code' | 'query' | 'ping' | 'pong';
interface WSMessage {
  type: WSMessageType;
  payload: unknown;
}

interface WSClient {
  socket: net.Socket | Duplex;
  isAlive: boolean;
  buffer: Buffer;
  send: (msg: WSMessage) => void;
  close: () => void;
}

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const clients = new Set<WSClient>();

const eventBus = new EventEmitter();

// Helpers to parse and frame WebSocket frames (RFC6455)

function generateAcceptKey(secWebSocketKey: string): string {
  return crypto
    .createHash('sha1')
    .update(secWebSocketKey + GUID, 'utf8')
    .digest('base64');
}

function frameMessage(data: Buffer | string): Buffer {
  /*
  Frame format:
  0                   1                   2                   3
  0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
 +-+-+-+-+-------+-+-------------+-------------------------------+
 |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
 |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
 |N|V|V|V|       |S|             |   (if payload len==126/127)   |
 | |1|2|3|       |K|             |                               |
 +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
 |     Extended payload length continued, if payload len == 127  |
 + - - - - - - - - - - - - - - - +-------------------------------+
 |                               |Masking-key, if MASK set to 1  |
 +-------------------------------+-------------------------------+
 | Masking-key (continued)       |          Payload Data         |
 +-------------------------------+-------------------------------+
*/

  const isString = typeof data === 'string';
  const payload = isString ? Buffer.from(data, 'utf8') : data;
  const payloadLength = payload.length;

  let payloadLenByte = 0;
  let extendedPayloadLength: Buffer | null = null;

  if (payloadLength <= 125) {
    payloadLenByte = payloadLength;
  } else if (payloadLength < 65536) {
    payloadLenByte = 126;
    extendedPayloadLength = Buffer.alloc(2);
    extendedPayloadLength.writeUInt16BE(payloadLength, 0);
  } else {
    payloadLenByte = 127;
    extendedPayloadLength = Buffer.alloc(8);
    // Write big uint64 BE
    // JS safe integer max is 2^53-1, so this is safe for our cases
    extendedPayloadLength.writeUInt32BE(0, 0); // high 32 bits zero
    extendedPayloadLength.writeUInt32BE(payloadLength, 4); // low 32 bits
  }

  const headerLength = 2 + (extendedPayloadLength ? extendedPayloadLength.length : 0);
  const frame = Buffer.alloc(headerLength + payloadLength);

  // FIN=1, RSV1-3=0, opcode=1 (text)
  frame[0] = 0b10000001;
  frame[1] = payloadLenByte; // MASK=0 (server->client no mask)

  if (extendedPayloadLength) extendedPayloadLength.copy(frame, 2);

  payload.copy(frame, headerLength);

  return frame;
}

function parseFrame(buffer: Buffer): { frameLength: number; opcode: number; data: Buffer; fin: boolean } | null {
  if (buffer.length < 2) return null;

  const firstByte = buffer[0];
  const secondByte = buffer[1];

  const fin = (firstByte & 0b10000000) !== 0;
  const opcode = firstByte & 0b00001111;
  const mask = (secondByte & 0b10000000) !== 0;
  let payloadLen = secondByte & 0b01111111;
  let offset = 2;

  if (payloadLen === 126) {
    if (buffer.length < offset + 2) return null;
    payloadLen = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLen === 127) {
    if (buffer.length < offset + 8) return null;
    // JS limitation: read only lower 32 bits
    const high = buffer.readUInt32BE(offset);
    const low = buffer.readUInt32BE(offset + 4);
    if (high !== 0) {
      throw new Error('Payload too big');
    }
    payloadLen = low;
    offset += 8;
  }

  let maskingKey: Buffer | null = null;
  if (mask) {
    if (buffer.length < offset + 4) return null;
    maskingKey = buffer.slice(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + payloadLen) return null;

  let payload = buffer.slice(offset, offset + payloadLen);
  if (mask && maskingKey) {
    // Unmask
    for (let i = 0; i < payloadLen; i++) {
      payload[i] ^= maskingKey[i % 4];
    }
  }

  const frameLength = offset + payloadLen;
  return { frameLength, opcode, data: payload, fin };
}

function safeJSONParse(str: string): unknown | null {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

// Routing URLs for API endpoints as per spec
const ROUTES = {
  shell: '/api/a2a/shell/exec',
  code: '/api/a2a/code',
  query: '/api/a2a/query',
};

function createWSClient(socket: net.Socket | Duplex): WSClient {
  let buffer = Buffer.alloc(0);
  let isAlive = true;

  function send(msg: WSMessage) {
    try {
      const str = JSON.stringify(msg);
      const frame = frameMessage(str);
      socket.write(frame);
    } catch (err) {
      logger.error('Failed to send WS message', err);
    }
  }

  function close() {
    try {
      socket.end();
    } catch {}
  }

  return {
    socket,
    get isAlive() {
      return isAlive;
    },
    set isAlive(val: boolean) {
      isAlive = val;
    },
    buffer,
    send,
    close,
  };
}

// Core router logic: on message, route to eventBus with route path and payload
function routeMessage(client: WSClient, msg: WSMessage) {
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
    logger.warn('Invalid WS message received, ignoring');
    return;
  }

  const { type, payload } = msg;

  if (type === 'ping') {
    client.send({ type: 'pong', payload: null });
    client.isAlive = true;
    return;
  }
  if (type === 'pong') {
    client.isAlive = true;
    return;
  }

  if (type === 'shell' || type === 'code' || type === 'query') {
    const route = ROUTES[type];
    if (!route) {
      logger.warn(`No route defined for WS message type: ${type}`);
      return;
    }
    // Emit event with route, client, payload
    eventBus.emit(route, { client, payload });
    return;
  }

  logger.warn(`Unknown WS message type received: ${type}`);
}

// Heartbeat ping every 30s
function heartbeat() {
  for (const client of clients) {
    if (!client.isAlive) {
      logger.debug('Terminating dead WS client');
      client.close();
      clients.delete(client);
      continue;
    }
    client.isAlive = false;
    try {
      client.send({ type: 'ping', payload: null });
    } catch (e) {
      logger.error('Error sending ping to WS client', e);
    }
  }
}

let heartbeatInterval: NodeJS.Timeout | null = null;

function startHeartbeat() {
  if (!heartbeatInterval) {
    heartbeatInterval = setInterval(heartbeat, 30_000);
  }
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function handleSocketData(client: WSClient, data: Buffer) {
  client.buffer = Buffer.concat([client.buffer, data]);

  while (true) {
    const frame = parseFrame(client.buffer);
    if (!frame) break;

    const { frameLength, opcode, data: payload, fin } = frame;

    // Remove parsed frame from buffer
    client.buffer = client.buffer.slice(frameLength);

    // Handle opcodes
    // 0x1 = text frame, 0x8 = close, 0x9 = ping, 0xA = pong
    switch (opcode) {
      case 0x1: // text frame
        {
          const text = payload.toString('utf8');
          const msg = safeJSONParse(text);
          if (msg && typeof msg === 'object' && 'type' in msg) {
            routeMessage(client, msg as WSMessage);
          } else {
            logger.warn('Invalid JSON WS message received');
          }
        }
        break;
      case 0x8: // connection close
        {
          client.close();
          clients.delete(client);
          logger.debug('WS client closed connection');
          return;
        }
      case 0x9: // ping from client
        {
          client.send({ type: 'pong', payload: null });
          client.isAlive = true;
        }
        break;
      case 0xA: // pong from client
        {
          client.isAlive = true;
        }
        break;
      default:
        logger.warn(`Unsupported WS opcode: ${opcode}`);
        break;
    }

    if (!fin) {
      // For simplicity, fragmented messages are not supported
      logger.warn('Fragmented WS frames not supported, closing client');
      client.close();
      clients.delete(client);
      return;
    }
  }
}

function doWebSocketHandshake(req: http.IncomingMessage, socket: net.Socket | Duplex): boolean {
  const upgradeHeader = (req.headers['upgrade'] || '').toString().toLowerCase();
  if (upgradeHeader !== 'websocket') {
    return false;
  }

  const secWebSocketKey = req.headers['sec-websocket-key'];
  if (typeof secWebSocketKey !== 'string') {
    logger.warn('Missing Sec-WebSocket-Key header');
    return false;
  }

  const secWebSocketAccept = generateAcceptKey(secWebSocketKey);

  const responseHeaders = [
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${secWebSocketAccept}`,
  ];

  // Optional protocols or extensions can be added here if needed

  socket.write(responseHeaders.join('\r\n') + '\r\n\r\n');
  return true;
}

export function attachWebSocketRouter(server: http.Server): void {
  server.on('upgrade', (req, socket, head) => {
    try {
      if (!doWebSocketHandshake(req, socket)) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
      }

      // After handshake socket is raw WebSocket connection
      const client = createWSClient(socket);
      clients.add(client);

      socket.on('data', (data) => {
        handleSocketData(client, data);
      });

      socket.on('close', () => {
        clients.delete(client);
        logger.debug('WS socket closed and client removed');
      });

      socket.on('error', (err) => {
        logger.error('WS socket error', err);
        clients.delete(client);
        socket.destroy();
      });

      // Start heartbeat if not started
      startHeartbeat();

      logger.info('WebSocket client connected');
    } catch (err) {
      logger.error('Error during WebSocket upgrade', err);
      try {
        socket.end();
      } catch {}
    }
  });
}

/**
 * Broadcast WS message to all connected clients
 * @param type message type
 * @param payload message payload
 */
export function broadcastWS(type: string, payload: unknown): void {
  const msg: WSMessage = { type: type as WSMessageType, payload };
  const str = JSON.stringify(msg);
  const frame = frameMessage(str);

  for (const client of clients) {
    try {
      client.socket.write(frame);
    } catch (err) {
      logger.error('Error broadcasting WS message to client', err);
    }
  }
}

// Expose eventBus for integration with API route handlers
export { eventBus };