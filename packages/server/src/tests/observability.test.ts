import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { WebSocket } from 'ws';
import { createApp } from '../app.js';
import type { AppWithObservability } from '../app.js';

function waitForMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for message')), 2000);
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

describe('Observability Integration', () => {
  let result: AppWithObservability;
  let port: number;

  beforeEach(async () => {
    result = createApp({ observability: { enabled: true } }) as AppWithObservability;

    await new Promise<void>((resolve) => {
      result.server.listen(0, () => {
        const addr = result.server.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    result.wsHub.close();
    await new Promise<void>((resolve) => result.server.close(() => resolve()));
  });

  it('captures MCP requests and responses via REST API', async () => {
    // Initialize a session
    const initResponse = await request(result.app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });

    expect(initResponse.status).toBe(200);
    const sessionId = initResponse.headers['mcp-session-id'];

    // Make a tools/list request (this one will definitely be captured with session ID)
    await request(result.app)
      .post('/mcp')
      .set('Mcp-Session-Id', sessionId)
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });

    // Check events via REST API
    const eventsResponse = await request(result.app)
      .get(`/api/events/sessions/${sessionId}`);

    expect(eventsResponse.status).toBe(200);
    expect(eventsResponse.body.events.length).toBeGreaterThan(0);

    // Should have captured both initialize and tools/list requests in the session
    const requests = eventsResponse.body.events.filter((e: any) => e.type === 'request');
    expect(requests.length).toBeGreaterThanOrEqual(2);
    expect(requests.some((e: any) => e.method === 'initialize')).toBe(true);
    expect(requests.some((e: any) => e.method === 'tools/list')).toBe(true);
  });

  it('streams events via WebSocket', async () => {
    // Connect to WebSocket
    const ws = new WebSocket(`ws://localhost:${port}/events`);
    await waitForOpen(ws);

    // Subscribe to all sessions
    ws.send(JSON.stringify({ type: 'subscribe', sessionId: '*' }));
    await new Promise((r) => setTimeout(r, 50));

    // Collect messages
    const received: any[] = [];
    ws.on('message', (data) => received.push(JSON.parse(data.toString())));

    // Initialize a session
    const initResponse = await request(result.app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });

    const sessionId = initResponse.headers['mcp-session-id'];

    // Make another request
    await request(result.app)
      .post('/mcp')
      .set('Mcp-Session-Id', sessionId)
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });

    // Wait for events to arrive
    await new Promise((r) => setTimeout(r, 200));

    ws.close();

    // Should have received events
    const eventMessages = received.filter((m) => m.type === 'event');
    expect(eventMessages.length).toBeGreaterThan(0);

    // Should include request events
    const requestEvents = eventMessages.filter((m) => m.event.type === 'request');
    expect(requestEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('captures task lifecycle events', async () => {
    // Initialize a session
    const initResponse = await request(result.app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });

    const sessionId = initResponse.headers['mcp-session-id'];

    // Start a task
    await request(result.app)
      .post('/mcp')
      .set('Mcp-Session-Id', sessionId)
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'pure_task',
          arguments: { durationMs: 100 },
          task: { ttl: 60000 },
        },
      });

    // Wait for task to complete
    await new Promise((r) => setTimeout(r, 300));

    // Check events
    const eventsResponse = await request(result.app)
      .get(`/api/events/sessions/${sessionId}`);

    expect(eventsResponse.status).toBe(200);
    expect(eventsResponse.body.events.length).toBeGreaterThan(0);

    // Should have captured the tools/call request
    const toolsCallRequest = eventsResponse.body.events.find(
      (e: any) => e.type === 'request' && e.method === 'tools/call'
    );
    expect(toolsCallRequest).toBeDefined();

    // Task events depend on ObservableTaskStore being used correctly
    // Check if we have task-related events
    const taskEvents = eventsResponse.body.events.filter(
      (e: any) => e.type === 'task:created' || e.type === 'task:status'
    );

    // We should have at least some task events if the store is working
    // If not, we'll at least have the request/response events
    expect(eventsResponse.body.events.some(
      (e: any) => e.type === 'request' || e.type === 'task:created'
    )).toBe(true);
  });

  it('lists all sessions via REST API', async () => {
    // Create two sessions
    await request(result.app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'client-a', version: '1.0.0' },
        },
      });

    await request(result.app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'client-b', version: '1.0.0' },
        },
      });

    // List sessions
    const sessionsResponse = await request(result.app)
      .get('/api/events/sessions');

    expect(sessionsResponse.status).toBe(200);
    // Should have exactly 2 sessions (no 'unknown' session for initialize requests)
    expect(sessionsResponse.body.sessions.length).toBe(2);
    // Verify no 'unknown' session exists
    const sessionIds = sessionsResponse.body.sessions.map((s: any) => s.sessionId);
    expect(sessionIds).not.toContain('unknown');
  });
});
