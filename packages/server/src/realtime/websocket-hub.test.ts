import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { WebSocket } from 'ws';
import { WebSocketHub } from './websocket-hub.js';
import { EventRegistry } from '../events/event-registry.js';

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for message')), 1000);
    ws.once('message', (data) => {
      clearTimeout(timeout);
      resolve(JSON.parse(data.toString()));
    });
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for open')), 1000);
    ws.once('open', () => {
      clearTimeout(timeout);
      resolve();
    });
    ws.once('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

describe('WebSocketHub', () => {
  let server: HttpServer;
  let hub: WebSocketHub;
  let registry: EventRegistry;
  let port: number;

  beforeEach(async () => {
    registry = new EventRegistry();
    server = createServer();
    hub = new WebSocketHub(server, registry);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const addr = server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    hub.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('connection', () => {
    it('accepts WebSocket connections on /events path', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/events`);
      await waitForOpen(ws);

      expect(ws.readyState).toBe(WebSocket.OPEN);
      ws.close();
    });
  });

  describe('subscribe', () => {
    it('receives events after subscribing to a session', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/events`);
      await waitForOpen(ws);

      // Subscribe to session
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'session-1' }));

      // Give time for subscription to process
      await new Promise((r) => setTimeout(r, 50));

      // Emit an event on that session
      const bus = registry.getOrCreateBus('session-1');
      bus.emit({ type: 'request', id: 1, method: 'test' });

      const msg = await waitForMessage(ws);
      expect(msg).toMatchObject({
        type: 'event',
        sessionId: 'session-1',
        event: expect.objectContaining({ type: 'request', method: 'test' }),
      });

      ws.close();
    });

    it('does not receive events from unsubscribed sessions', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/events`);
      await waitForOpen(ws);

      // Subscribe to session-1 only
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'session-1' }));
      await new Promise((r) => setTimeout(r, 50));

      // Emit on session-2 (not subscribed)
      const bus2 = registry.getOrCreateBus('session-2');
      bus2.emit({ type: 'request', id: 1, method: 'test' });

      // Should not receive anything (wait a bit to confirm)
      const received: unknown[] = [];
      ws.on('message', (data) => received.push(JSON.parse(data.toString())));
      await new Promise((r) => setTimeout(r, 100));

      expect(received.filter((m: any) => m.type === 'event')).toHaveLength(0);

      ws.close();
    });

    it('wildcard subscription receives all events', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/events`);
      await waitForOpen(ws);

      // Collect all messages
      const received: unknown[] = [];
      ws.on('message', (data) => received.push(JSON.parse(data.toString())));

      // Subscribe to all sessions
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: '*' }));
      await new Promise((r) => setTimeout(r, 50));

      // Emit on different sessions
      const bus1 = registry.getOrCreateBus('session-1');
      const bus2 = registry.getOrCreateBus('session-2');

      bus1.emit({ type: 'request', id: 1, method: 'method-1' });
      bus2.emit({ type: 'request', id: 2, method: 'method-2' });

      // Wait for messages to arrive
      await new Promise((r) => setTimeout(r, 100));

      const eventMessages = received.filter((m: any) => m.type === 'event');
      expect(eventMessages).toHaveLength(2);
      expect(eventMessages).toContainEqual(
        expect.objectContaining({ sessionId: 'session-1' })
      );
      expect(eventMessages).toContainEqual(
        expect.objectContaining({ sessionId: 'session-2' })
      );

      ws.close();
    });
  });

  describe('unsubscribe', () => {
    it('stops receiving events after unsubscribing', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/events`);
      await waitForOpen(ws);

      // Subscribe then unsubscribe
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: 'session-1' }));
      await new Promise((r) => setTimeout(r, 50));
      ws.send(JSON.stringify({ type: 'unsubscribe', sessionId: 'session-1' }));
      await new Promise((r) => setTimeout(r, 50));

      // Emit an event
      const bus = registry.getOrCreateBus('session-1');
      bus.emit({ type: 'request', id: 1, method: 'test' });

      // Should not receive
      const received: unknown[] = [];
      ws.on('message', (data) => received.push(JSON.parse(data.toString())));
      await new Promise((r) => setTimeout(r, 100));

      expect(received.filter((m: any) => m.type === 'event')).toHaveLength(0);

      ws.close();
    });
  });

  describe('list_sessions', () => {
    it('returns all active sessions', async () => {
      // Create some sessions
      registry.getOrCreateBus('session-a');
      registry.getOrCreateBus('session-b');

      const ws = new WebSocket(`ws://localhost:${port}/events`);
      await waitForOpen(ws);

      ws.send(JSON.stringify({ type: 'list_sessions' }));

      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe('sessions');
      expect(msg.sessions).toHaveLength(2);
      expect(msg.sessions.map((s: any) => s.sessionId)).toContain('session-a');
      expect(msg.sessions.map((s: any) => s.sessionId)).toContain('session-b');

      ws.close();
    });
  });

  describe('backfill', () => {
    it('returns historical events for a session', async () => {
      // Create session and add events
      const bus = registry.getOrCreateBus('session-1');
      bus.emit({ type: 'request', id: 1, method: 'method-1' });
      bus.emit({ type: 'request', id: 2, method: 'method-2' });

      const ws = new WebSocket(`ws://localhost:${port}/events`);
      await waitForOpen(ws);

      ws.send(JSON.stringify({ type: 'backfill', sessionId: 'session-1' }));

      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe('backfill');
      expect(msg.sessionId).toBe('session-1');
      expect(msg.events).toHaveLength(2);

      ws.close();
    });

    it('respects limit parameter', async () => {
      const bus = registry.getOrCreateBus('session-1');
      for (let i = 0; i < 10; i++) {
        bus.emit({ type: 'request', id: i, method: `method-${i}` });
      }

      const ws = new WebSocket(`ws://localhost:${port}/events`);
      await waitForOpen(ws);

      ws.send(JSON.stringify({ type: 'backfill', sessionId: 'session-1', limit: 3 }));

      const msg = (await waitForMessage(ws)) as any;
      expect(msg.events).toHaveLength(3);

      ws.close();
    });

    it('respects since parameter', async () => {
      const bus = registry.getOrCreateBus('session-1');
      bus.emit({ type: 'request', id: 1, method: 'old' });

      const midpoint = Date.now();
      await new Promise((r) => setTimeout(r, 10));

      bus.emit({ type: 'request', id: 2, method: 'new' });

      const ws = new WebSocket(`ws://localhost:${port}/events`);
      await waitForOpen(ws);

      ws.send(JSON.stringify({ type: 'backfill', sessionId: 'session-1', since: midpoint }));

      const msg = (await waitForMessage(ws)) as any;
      expect(msg.events.length).toBeGreaterThanOrEqual(1);
      msg.events.forEach((e: any) => {
        expect(e.timestamp).toBeGreaterThanOrEqual(midpoint);
      });

      ws.close();
    });
  });

  describe('session lifecycle events', () => {
    it('broadcasts session_created when new bus is created via hub notification', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/events`);
      await waitForOpen(ws);

      // Subscribe to all to receive session events
      ws.send(JSON.stringify({ type: 'subscribe', sessionId: '*' }));
      await new Promise((r) => setTimeout(r, 50));

      // Notify hub of new session
      hub.notifySessionCreated('new-session', { name: 'test', version: '1.0' });

      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe('session_created');
      expect(msg.session.sessionId).toBe('new-session');

      ws.close();
    });

    it('broadcasts session_closed when session is closed', async () => {
      registry.getOrCreateBus('session-1');

      const ws = new WebSocket(`ws://localhost:${port}/events`);
      await waitForOpen(ws);

      ws.send(JSON.stringify({ type: 'subscribe', sessionId: '*' }));
      await new Promise((r) => setTimeout(r, 50));

      // Close the session
      registry.closeSession('session-1');

      const msg = (await waitForMessage(ws)) as any;
      expect(msg.type).toBe('session_closed');
      expect(msg.sessionId).toBe('session-1');

      ws.close();
    });
  });
});
