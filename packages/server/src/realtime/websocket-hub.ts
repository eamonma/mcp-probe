import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type { EventRegistry, SessionMetadata } from '../events/event-registry.js';
import type { Event } from '../events/types.js';

/**
 * Client message types.
 */
type ClientMessage =
  | { type: 'subscribe'; sessionId: string }
  | { type: 'unsubscribe'; sessionId: string }
  | { type: 'backfill'; sessionId: string; since?: number; limit?: number }
  | { type: 'list_sessions' };

/**
 * Server message types.
 */
type ServerMessage =
  | { type: 'event'; sessionId: string; event: Event }
  | { type: 'backfill'; sessionId: string; events: Event[] }
  | {
      type: 'sessions';
      sessions: Array<{
        sessionId: string;
        eventCount: number;
        clientInfo?: { name: string; version: string };
        createdAt?: string;
      }>;
    }
  | {
      type: 'session_created';
      session: {
        sessionId: string;
        clientInfo?: { name: string; version: string };
        createdAt?: string;
      };
    }
  | { type: 'session_closed'; sessionId: string }
  | { type: 'error'; message: string };

/**
 * Per-client state.
 */
interface ClientState {
  ws: WebSocket;
  subscriptions: Set<string>;
}

/**
 * WebSocket hub for real-time event delivery to dashboards.
 *
 * Provides:
 * - Subscription management (per-session or wildcard)
 * - Event broadcasting to subscribed clients
 * - Historical event backfill
 * - Session lifecycle notifications
 */
export class WebSocketHub {
  private wss: WebSocketServer;
  private clients = new Map<WebSocket, ClientState>();

  constructor(
    server: HttpServer,
    private registry: EventRegistry
  ) {
    this.wss = new WebSocketServer({ server, path: '/events' });
    this.setupConnectionHandler();
    this.setupRegistryListeners();
  }

  /**
   * Notify the hub that a new session was created.
   * This broadcasts to all subscribed clients.
   */
  notifySessionCreated(sessionId: string, clientInfo?: { name: string; version: string }): void {
    this.broadcast({
      type: 'session_created',
      session: { sessionId, clientInfo },
    });
  }

  /**
   * Close the WebSocket server.
   */
  close(): void {
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.wss.close();
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', (ws) => {
      const state: ClientState = { ws, subscriptions: new Set() };
      this.clients.set(ws, state);

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString()) as ClientMessage;
          this.handleClientMessage(state, msg);
        } catch {
          this.send(ws, { type: 'error', message: 'Invalid JSON' });
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });
    });
  }

  private setupRegistryListeners(): void {
    // Forward events from registry to subscribed clients
    this.registry.on('event', (sessionId: string, event: Event) => {
      this.broadcastToSubscribers(sessionId, {
        type: 'event',
        sessionId,
        event,
      });
    });

    // Forward session created events
    this.registry.on('session:created', (sessionId: string, metadata: SessionMetadata) => {
      this.broadcast({
        type: 'session_created',
        session: {
          sessionId,
          clientInfo: metadata.clientInfo,
          createdAt: metadata.createdAt?.toISOString(),
        },
      });
    });

    // Forward session closed events
    this.registry.on('session:closed', (sessionId: string) => {
      this.broadcast({
        type: 'session_closed',
        sessionId,
      });
    });
  }

  private handleClientMessage(client: ClientState, msg: ClientMessage): void {
    switch (msg.type) {
      case 'subscribe':
        client.subscriptions.add(msg.sessionId);
        break;

      case 'unsubscribe':
        client.subscriptions.delete(msg.sessionId);
        break;

      case 'backfill': {
        const bus = this.registry.getBus(msg.sessionId);
        if (bus) {
          const events = bus.getEvents({ since: msg.since, limit: msg.limit });
          this.send(client.ws, {
            type: 'backfill',
            sessionId: msg.sessionId,
            events,
          });
        } else {
          this.send(client.ws, {
            type: 'backfill',
            sessionId: msg.sessionId,
            events: [],
          });
        }
        break;
      }

      case 'list_sessions':
        this.send(client.ws, {
          type: 'sessions',
          sessions: this.registry.getSessionSummaries().map((s) => ({
            sessionId: s.sessionId,
            eventCount: s.eventCount,
            clientInfo: s.clientInfo,
            createdAt: s.createdAt?.toISOString(),
          })),
        });
        break;
    }
  }

  private broadcastToSubscribers(sessionId: string, msg: ServerMessage): void {
    for (const client of this.clients.values()) {
      if (client.subscriptions.has(sessionId) || client.subscriptions.has('*')) {
        this.send(client.ws, msg);
      }
    }
  }

  private broadcast(msg: ServerMessage): void {
    for (const client of this.clients.values()) {
      // Broadcast to all clients subscribed to wildcard
      if (client.subscriptions.has('*')) {
        this.send(client.ws, msg);
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }
}
