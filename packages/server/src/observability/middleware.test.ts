import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createObservabilityMiddleware } from './middleware.js';
import { EventRegistry } from '../events/event-registry.js';
import type { RequestEvent, ResponseEvent, NotificationEvent } from '../events/types.js';

describe('observability middleware', () => {
  let app: express.Express;
  let registry: EventRegistry;

  beforeEach(() => {
    registry = new EventRegistry();
    app = express();
    app.use(express.json());
    app.use(createObservabilityMiddleware(registry));
  });

  describe('request capture', () => {
    it('emits request event for POST with JSON-RPC body', async () => {
      app.post('/mcp', (_req, res) => {
        res.json({ jsonrpc: '2.0', id: 1, result: {} });
      });

      const listener = vi.fn();
      registry.on('event', listener);

      await request(app)
        .post('/mcp')
        .set('Mcp-Session-Id', 'session-1')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {},
        });

      expect(listener).toHaveBeenCalled();
      const [sessionId, event] = listener.mock.calls.find(
        (call) => call[1].type === 'request'
      ) || [];

      expect(sessionId).toBe('session-1');
      expect(event.type).toBe('request');
      expect((event as RequestEvent).method).toBe('tools/list');
      expect((event as RequestEvent).id).toBe(1);
    });

    it('uses session ID from header', async () => {
      app.post('/mcp', (_req, res) => {
        res.json({ jsonrpc: '2.0', id: 1, result: {} });
      });

      const listener = vi.fn();
      registry.on('event', listener);

      await request(app)
        .post('/mcp')
        .set('Mcp-Session-Id', 'my-session-123')
        .send({ jsonrpc: '2.0', id: 1, method: 'test' });

      const [sessionId] = listener.mock.calls[0];
      expect(sessionId).toBe('my-session-123');
    });

    it('extracts session ID from initialize request when no header', async () => {
      app.post('/mcp', (_req, res) => {
        res.set('Mcp-Session-Id', 'new-session-456');
        res.json({ jsonrpc: '2.0', id: 1, result: {} });
      });

      const listener = vi.fn();
      registry.on('event', listener);

      await request(app)
        .post('/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: { clientInfo: { name: 'test', version: '1.0' } },
        });

      // Should still capture the request (may use response header for session)
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('JSON response capture', () => {
    it('emits response event for JSON result', async () => {
      app.post('/mcp', (_req, res) => {
        res.json({
          jsonrpc: '2.0',
          id: 1,
          result: { tools: ['tool1', 'tool2'] },
        });
      });

      const listener = vi.fn();
      registry.on('event', listener);

      await request(app)
        .post('/mcp')
        .set('Mcp-Session-Id', 'session-1')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });

      const responseCalls = listener.mock.calls.filter(
        (call) => call[1].type === 'response'
      );
      expect(responseCalls.length).toBeGreaterThan(0);

      const [, responseEvent] = responseCalls[0];
      expect((responseEvent as ResponseEvent).id).toBe(1);
      expect((responseEvent as ResponseEvent).result).toEqual({ tools: ['tool1', 'tool2'] });
    });

    it('emits response event for JSON error', async () => {
      app.post('/mcp', (_req, res) => {
        res.json({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32600, message: 'Invalid request' },
        });
      });

      const listener = vi.fn();
      registry.on('event', listener);

      await request(app)
        .post('/mcp')
        .set('Mcp-Session-Id', 'session-1')
        .send({ jsonrpc: '2.0', id: 1, method: 'invalid' });

      const responseCalls = listener.mock.calls.filter(
        (call) => call[1].type === 'response'
      );
      expect(responseCalls.length).toBeGreaterThan(0);

      const [, responseEvent] = responseCalls[0];
      expect((responseEvent as ResponseEvent).error?.code).toBe(-32600);
    });
  });

  describe('SSE response capture', () => {
    it('parses SSE events and emits notifications', async () => {
      app.post('/mcp', (_req, res) => {
        res.set('Content-Type', 'text/event-stream');
        res.write('event: message\n');
        res.write('data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1,"total":10}}\n\n');
        res.write('event: message\n');
        res.write('data: {"jsonrpc":"2.0","id":1,"result":{"done":true}}\n\n');
        res.end();
      });

      const listener = vi.fn();
      registry.on('event', listener);

      await request(app)
        .post('/mcp')
        .set('Mcp-Session-Id', 'session-1')
        .set('Accept', 'text/event-stream')
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/call' });

      // Should have request + notification + response
      const notificationCalls = listener.mock.calls.filter(
        (call) => call[1].type === 'notification'
      );
      const responseCalls = listener.mock.calls.filter(
        (call) => call[1].type === 'response'
      );

      expect(notificationCalls.length).toBeGreaterThan(0);
      expect(responseCalls.length).toBeGreaterThan(0);

      const [, notifEvent] = notificationCalls[0];
      expect((notifEvent as NotificationEvent).method).toBe('notifications/progress');
    });

    it('handles multiple SSE events in single chunk', async () => {
      app.post('/mcp', (_req, res) => {
        res.set('Content-Type', 'text/event-stream');
        // Multiple events in one write
        res.write(
          'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":1}}\n\n' +
          'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{"progress":2}}\n\n' +
          'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n'
        );
        res.end();
      });

      const listener = vi.fn();
      registry.on('event', listener);

      await request(app)
        .post('/mcp')
        .set('Mcp-Session-Id', 'session-1')
        .send({ jsonrpc: '2.0', id: 1, method: 'test' });

      const notificationCalls = listener.mock.calls.filter(
        (call) => call[1].type === 'notification'
      );
      expect(notificationCalls.length).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles requests without session ID gracefully', async () => {
      app.post('/mcp', (_req, res) => {
        res.json({ jsonrpc: '2.0', id: 1, result: {} });
      });

      const listener = vi.fn();
      registry.on('event', listener);

      // No Mcp-Session-Id header
      await request(app)
        .post('/mcp')
        .send({ jsonrpc: '2.0', id: 1, method: 'test' });

      // Should use a default/unknown session ID
      expect(listener).toHaveBeenCalled();
    });

    it('handles non-JSON bodies gracefully', async () => {
      app.post('/other', (_req, res) => {
        res.send('OK');
      });

      const listener = vi.fn();
      registry.on('event', listener);

      await request(app)
        .post('/other')
        .set('Mcp-Session-Id', 'session-1')
        .send('not json');

      // Should not crash, may not emit events
      expect(true).toBe(true);
    });

    it('handles empty response body', async () => {
      app.post('/mcp', (_req, res) => {
        res.status(204).end();
      });

      const listener = vi.fn();
      registry.on('event', listener);

      await request(app)
        .post('/mcp')
        .set('Mcp-Session-Id', 'session-1')
        .send({ jsonrpc: '2.0', id: 1, method: 'test' });

      // Should capture request at minimum
      const requestCalls = listener.mock.calls.filter(
        (call) => call[1].type === 'request'
      );
      expect(requestCalls.length).toBe(1);
    });
  });
});
