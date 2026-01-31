import { describe, it, expect, vi } from 'vitest';
import { EventRegistry } from './event-registry.js';
import type { RequestEvent, ResponseEvent } from './types.js';

// Helper to create typed events without timestamp
function requestEvent(id: number, method: string): Omit<RequestEvent, 'timestamp'> {
  return { type: 'request', id, method };
}

function responseEvent(id: number, result: unknown): Omit<ResponseEvent, 'timestamp'> {
  return { type: 'response', id, result };
}

describe('EventRegistry', () => {
  describe('getOrCreateBus', () => {
    it('creates a new bus for unknown session', () => {
      const registry = new EventRegistry();

      const bus = registry.getOrCreateBus('session-1');

      expect(bus).toBeDefined();
      expect(bus.sessionId).toBe('session-1');
    });

    it('returns same bus for same session', () => {
      const registry = new EventRegistry();

      const bus1 = registry.getOrCreateBus('session-1');
      const bus2 = registry.getOrCreateBus('session-1');

      expect(bus1).toBe(bus2);
    });

    it('creates different buses for different sessions', () => {
      const registry = new EventRegistry();

      const bus1 = registry.getOrCreateBus('session-1');
      const bus2 = registry.getOrCreateBus('session-2');

      expect(bus1).not.toBe(bus2);
      expect(bus1.sessionId).toBe('session-1');
      expect(bus2.sessionId).toBe('session-2');
    });

    it('uses provided maxEventsPerSession option', () => {
      const registry = new EventRegistry({ maxEventsPerSession: 5 });
      const bus = registry.getOrCreateBus('session-1');

      // Add 6 events
      for (let i = 0; i < 6; i++) {
        bus.emit(requestEvent(i, `method-${i}`));
      }

      // Should only have 5 (ring buffer limit)
      expect(bus.eventCount).toBe(5);
    });
  });

  describe('getBus', () => {
    it('returns undefined for unknown session', () => {
      const registry = new EventRegistry();

      const bus = registry.getBus('unknown');

      expect(bus).toBeUndefined();
    });

    it('returns existing bus', () => {
      const registry = new EventRegistry();
      const created = registry.getOrCreateBus('session-1');

      const retrieved = registry.getBus('session-1');

      expect(retrieved).toBe(created);
    });
  });

  describe('closeSession', () => {
    it('removes the bus for the session', () => {
      const registry = new EventRegistry();
      registry.getOrCreateBus('session-1');

      registry.closeSession('session-1');

      expect(registry.getBus('session-1')).toBeUndefined();
    });

    it('emits session:closed event', () => {
      const registry = new EventRegistry();
      const listener = vi.fn();
      registry.on('session:closed', listener);

      registry.getOrCreateBus('session-1');
      registry.closeSession('session-1');

      expect(listener).toHaveBeenCalledWith('session-1');
    });

    it('does nothing for unknown session', () => {
      const registry = new EventRegistry();
      const listener = vi.fn();
      registry.on('session:closed', listener);

      // Should not throw
      registry.closeSession('unknown');

      expect(listener).not.toHaveBeenCalled();
    });

    it('returns the bus events before closing (for archiving)', () => {
      const registry = new EventRegistry();
      const bus = registry.getOrCreateBus('session-1');

      bus.emit(requestEvent(1, 'test'));
      bus.emit(responseEvent(1, {}));

      const events = registry.closeSession('session-1');

      expect(events).toHaveLength(2);
      expect(events![0].type).toBe('request');
      expect(events![1].type).toBe('response');
    });

    it('returns undefined for unknown session', () => {
      const registry = new EventRegistry();

      const events = registry.closeSession('unknown');

      expect(events).toBeUndefined();
    });
  });

  describe('event forwarding', () => {
    it('forwards events from all buses with sessionId', () => {
      const registry = new EventRegistry();
      const listener = vi.fn();
      registry.on('event', listener);

      const bus1 = registry.getOrCreateBus('session-1');
      const bus2 = registry.getOrCreateBus('session-2');

      bus1.emit(requestEvent(1, 'method-1'));
      bus2.emit(requestEvent(2, 'method-2'));

      expect(listener).toHaveBeenCalledTimes(2);

      // First call should have session-1
      expect(listener.mock.calls[0][0]).toBe('session-1');
      expect(listener.mock.calls[0][1].method).toBe('method-1');

      // Second call should have session-2
      expect(listener.mock.calls[1][0]).toBe('session-2');
      expect(listener.mock.calls[1][1].method).toBe('method-2');
    });
  });

  describe('getAllSessions', () => {
    it('returns empty array when no sessions', () => {
      const registry = new EventRegistry();

      expect(registry.getAllSessions()).toEqual([]);
    });

    it('returns all session IDs', () => {
      const registry = new EventRegistry();

      registry.getOrCreateBus('session-1');
      registry.getOrCreateBus('session-2');
      registry.getOrCreateBus('session-3');

      const sessions = registry.getAllSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions).toContain('session-1');
      expect(sessions).toContain('session-2');
      expect(sessions).toContain('session-3');
    });
  });

  describe('getSessionSummaries', () => {
    it('returns summaries with event counts', () => {
      const registry = new EventRegistry();

      const bus1 = registry.getOrCreateBus('session-1');
      bus1.emit(requestEvent(1, 'test'));
      bus1.emit(responseEvent(1, {}));

      const bus2 = registry.getOrCreateBus('session-2');
      bus2.emit(requestEvent(1, 'test'));

      const summaries = registry.getSessionSummaries();

      expect(summaries).toHaveLength(2);

      const summary1 = summaries.find((s) => s.sessionId === 'session-1');
      const summary2 = summaries.find((s) => s.sessionId === 'session-2');

      expect(summary1?.eventCount).toBe(2);
      expect(summary2?.eventCount).toBe(1);
    });

    it('includes client info when set', () => {
      const registry = new EventRegistry();
      const createdAt = new Date();

      registry.getOrCreateBus('session-1');
      registry.setSessionMetadata('session-1', {
        clientInfo: { name: 'TestClient', version: '2.0.0' },
        createdAt,
      });

      const summaries = registry.getSessionSummaries();
      const summary = summaries.find((s) => s.sessionId === 'session-1');

      expect(summary?.clientInfo).toEqual({ name: 'TestClient', version: '2.0.0' });
      expect(summary?.createdAt).toBe(createdAt);
    });
  });

  describe('setSessionMetadata', () => {
    it('stores metadata for session', () => {
      const registry = new EventRegistry();
      const createdAt = new Date();

      registry.getOrCreateBus('session-1');
      registry.setSessionMetadata('session-1', {
        clientInfo: { name: 'MyClient', version: '1.0.0' },
        createdAt,
      });

      const summaries = registry.getSessionSummaries();
      const summary = summaries.find((s) => s.sessionId === 'session-1');

      expect(summary?.clientInfo?.name).toBe('MyClient');
    });

    it('does nothing for unknown session', () => {
      const registry = new EventRegistry();

      // Should not throw
      registry.setSessionMetadata('unknown', {
        clientInfo: { name: 'Test', version: '1.0' },
        createdAt: new Date(),
      });

      expect(registry.getSessionSummaries()).toHaveLength(0);
    });
  });
});
