import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './event-bus.js';
import type { RequestEvent, ResponseEvent, Event } from './types.js';

function createRequestEvent(id: number, method: string): Omit<RequestEvent, 'timestamp'> {
  return { type: 'request', id, method };
}

function createResponseEvent(id: number, result: unknown): Omit<ResponseEvent, 'timestamp'> {
  return { type: 'response', id, result };
}

describe('EventBus', () => {
  describe('emit', () => {
    it('adds timestamp to events', () => {
      const bus = new EventBus('session-1');
      const before = Date.now();

      bus.emit(createRequestEvent(1, 'tools/list'));

      const events = bus.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(events[0].timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('preserves event data', () => {
      const bus = new EventBus('session-1');

      bus.emit(createRequestEvent(1, 'tools/call'));

      const events = bus.getEvents();
      expect(events[0].type).toBe('request');
      expect((events[0] as RequestEvent).id).toBe(1);
      expect((events[0] as RequestEvent).method).toBe('tools/call');
    });

    it('notifies subscribers synchronously', () => {
      const bus = new EventBus('session-1');
      const listener = vi.fn();

      bus.on('event', listener);
      bus.emit(createRequestEvent(1, 'tools/list'));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        type: 'request',
        method: 'tools/list',
      }));
    });

    it('supports multiple subscribers', () => {
      const bus = new EventBus('session-1');
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      bus.on('event', listener1);
      bus.on('event', listener2);
      bus.emit(createRequestEvent(1, 'tools/list'));

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe('ring buffer behavior', () => {
    it('respects maxEvents limit', () => {
      const bus = new EventBus('session-1', { maxEvents: 3 });

      bus.emit(createRequestEvent(1, 'method-1'));
      bus.emit(createRequestEvent(2, 'method-2'));
      bus.emit(createRequestEvent(3, 'method-3'));
      bus.emit(createRequestEvent(4, 'method-4'));

      const events = bus.getEvents();
      expect(events).toHaveLength(3);

      // Oldest event (1) should be evicted
      const methods = events.map((e) => (e as RequestEvent).method);
      expect(methods).toEqual(['method-2', 'method-3', 'method-4']);
    });

    it('defaults to 1000 events', () => {
      const bus = new EventBus('session-1');

      // Add 1001 events
      for (let i = 0; i < 1001; i++) {
        bus.emit(createRequestEvent(i, `method-${i}`));
      }

      const events = bus.getEvents();
      expect(events).toHaveLength(1000);

      // First event should be method-1 (method-0 evicted)
      expect((events[0] as RequestEvent).method).toBe('method-1');
    });
  });

  describe('getEvents', () => {
    it('returns all events when no filters', () => {
      const bus = new EventBus('session-1');

      bus.emit(createRequestEvent(1, 'method-1'));
      bus.emit(createResponseEvent(1, { ok: true }));
      bus.emit(createRequestEvent(2, 'method-2'));

      const events = bus.getEvents();
      expect(events).toHaveLength(3);
    });

    it('filters by since timestamp', () => {
      const bus = new EventBus('session-1');

      bus.emit(createRequestEvent(1, 'method-1'));

      const midpoint = Date.now();

      // Small delay to ensure timestamp difference
      bus.emit(createRequestEvent(2, 'method-2'));
      bus.emit(createRequestEvent(3, 'method-3'));

      const events = bus.getEvents({ since: midpoint });

      // Should only include events after midpoint
      expect(events.length).toBeGreaterThanOrEqual(1);
      events.forEach((e) => {
        expect(e.timestamp).toBeGreaterThanOrEqual(midpoint);
      });
    });

    it('respects limit parameter', () => {
      const bus = new EventBus('session-1');

      bus.emit(createRequestEvent(1, 'method-1'));
      bus.emit(createRequestEvent(2, 'method-2'));
      bus.emit(createRequestEvent(3, 'method-3'));
      bus.emit(createRequestEvent(4, 'method-4'));

      const events = bus.getEvents({ limit: 2 });
      expect(events).toHaveLength(2);

      // Should return most recent events
      const ids = events.map((e) => (e as RequestEvent).id);
      expect(ids).toEqual([3, 4]);
    });

    it('combines since and limit', () => {
      const bus = new EventBus('session-1');

      bus.emit(createRequestEvent(1, 'method-1'));
      const midpoint = Date.now();
      bus.emit(createRequestEvent(2, 'method-2'));
      bus.emit(createRequestEvent(3, 'method-3'));
      bus.emit(createRequestEvent(4, 'method-4'));

      const events = bus.getEvents({ since: midpoint, limit: 2 });

      expect(events.length).toBeLessThanOrEqual(2);
      events.forEach((e) => {
        expect(e.timestamp).toBeGreaterThanOrEqual(midpoint);
      });
    });

    it('returns empty array when no events', () => {
      const bus = new EventBus('session-1');

      const events = bus.getEvents();
      expect(events).toEqual([]);
    });

    it('returns empty array when since is in the future', () => {
      const bus = new EventBus('session-1');

      bus.emit(createRequestEvent(1, 'method-1'));

      const futureTimestamp = Date.now() + 10000;
      const events = bus.getEvents({ since: futureTimestamp });
      expect(events).toEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all events', () => {
      const bus = new EventBus('session-1');

      bus.emit(createRequestEvent(1, 'method-1'));
      bus.emit(createRequestEvent(2, 'method-2'));

      expect(bus.getEvents()).toHaveLength(2);

      bus.clear();

      expect(bus.getEvents()).toHaveLength(0);
    });
  });

  describe('sessionId', () => {
    it('exposes sessionId', () => {
      const bus = new EventBus('my-session-123');

      expect(bus.sessionId).toBe('my-session-123');
    });
  });

  describe('eventCount', () => {
    it('returns current event count', () => {
      const bus = new EventBus('session-1');

      expect(bus.eventCount).toBe(0);

      bus.emit(createRequestEvent(1, 'method-1'));
      expect(bus.eventCount).toBe(1);

      bus.emit(createRequestEvent(2, 'method-2'));
      expect(bus.eventCount).toBe(2);
    });

    it('reflects ring buffer eviction', () => {
      const bus = new EventBus('session-1', { maxEvents: 2 });

      bus.emit(createRequestEvent(1, 'method-1'));
      bus.emit(createRequestEvent(2, 'method-2'));
      bus.emit(createRequestEvent(3, 'method-3'));

      expect(bus.eventCount).toBe(2);
    });
  });

  describe('toJSON', () => {
    it('returns serializable snapshot', () => {
      const bus = new EventBus('session-1');

      bus.emit(createRequestEvent(1, 'tools/list'));
      bus.emit(createResponseEvent(1, { tools: [] }));

      const json = bus.toJSON();

      expect(json.sessionId).toBe('session-1');
      expect(json.events).toHaveLength(2);
      expect(json.eventCount).toBe(2);

      // Should be JSON-serializable
      const serialized = JSON.stringify(json);
      const parsed = JSON.parse(serialized);
      expect(parsed.sessionId).toBe('session-1');
    });
  });

  describe('off', () => {
    it('removes event listener', () => {
      const bus = new EventBus('session-1');
      const listener = vi.fn();

      bus.on('event', listener);
      bus.emit(createRequestEvent(1, 'method-1'));
      expect(listener).toHaveBeenCalledTimes(1);

      bus.off('event', listener);
      bus.emit(createRequestEvent(2, 'method-2'));
      expect(listener).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });
});
