import { describe, it, expect, vi } from 'vitest';
import { EventBus } from './event-bus.js';
import { wrapTransportForObservability } from './observable-transport.js';

describe('wrapTransportForObservability', () => {
  it('emits notification event when transport sends a notification', async () => {
    const bus = new EventBus('test-session');
    const listener = vi.fn();
    bus.on('event', listener);

    // Create a mock transport with a send method
    const originalSend = vi.fn().mockResolvedValue(undefined);
    const mockTransport = {
      send: originalSend,
    };

    const wrapped = wrapTransportForObservability(mockTransport as any, bus);

    // Send a notification (has method, no id)
    await wrapped.send({ jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 5, total: 10 } });

    // Original send should be called
    expect(originalSend).toHaveBeenCalledWith(
      { jsonrpc: '2.0', method: 'notifications/progress', params: { progress: 5, total: 10 } },
      undefined
    );

    // Event should be emitted
    expect(listener).toHaveBeenCalled();
    const emittedEvent = listener.mock.calls[0][0];
    expect(emittedEvent.type).toBe('notification');
    expect(emittedEvent.method).toBe('notifications/progress');
    expect(emittedEvent.params).toEqual({ progress: 5, total: 10 });
  });

  it('emits response event when transport sends a response', async () => {
    const bus = new EventBus('test-session');
    const listener = vi.fn();
    bus.on('event', listener);

    const mockTransport = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    const wrapped = wrapTransportForObservability(mockTransport as any, bus);

    // Send a response (has id and result)
    await wrapped.send({ jsonrpc: '2.0', id: 1, result: { content: [] } });

    expect(listener).toHaveBeenCalled();
    const emittedEvent = listener.mock.calls[0][0];
    expect(emittedEvent.type).toBe('response');
    expect(emittedEvent.id).toBe(1);
    expect(emittedEvent.result).toEqual({ content: [] });
  });

  it('emits response event with error when transport sends error response', async () => {
    const bus = new EventBus('test-session');
    const listener = vi.fn();
    bus.on('event', listener);

    const mockTransport = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    const wrapped = wrapTransportForObservability(mockTransport as any, bus);

    // Send an error response
    await wrapped.send({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'Tool failed' } });

    expect(listener).toHaveBeenCalled();
    const emittedEvent = listener.mock.calls[0][0];
    expect(emittedEvent.type).toBe('response');
    expect(emittedEvent.id).toBe(1);
    expect(emittedEvent.error).toEqual({ code: -32000, message: 'Tool failed' });
  });

  it('passes options through to original send', async () => {
    const bus = new EventBus('test-session');
    const originalSend = vi.fn().mockResolvedValue(undefined);
    const mockTransport = {
      send: originalSend,
    };

    const wrapped = wrapTransportForObservability(mockTransport as any, bus);

    await wrapped.send(
      { jsonrpc: '2.0', method: 'notifications/progress', params: {} },
      { relatedRequestId: 42 }
    );

    expect(originalSend).toHaveBeenCalledWith(
      { jsonrpc: '2.0', method: 'notifications/progress', params: {} },
      { relatedRequestId: 42 }
    );
  });
});
