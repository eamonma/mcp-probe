import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create mock span factory - must be defined before vi.mock
const mockSpan = {
  setStatus: vi.fn(),
  setAttributes: vi.fn(),
  setAttribute: vi.fn(),
  addEvent: vi.fn(),
  recordException: vi.fn(),
  end: vi.fn(),
};

// Mock the @opentelemetry/api module
vi.mock('@opentelemetry/api', () => ({
  SpanStatusCode: { OK: 0, ERROR: 2 },
  trace: {
    getTracer: () => ({
      startActiveSpan: vi.fn(
        (
          name: string,
          options: unknown,
          fn?: (span: typeof mockSpan) => unknown
        ) => {
          const callback = typeof options === 'function' ? options : fn;
          return (callback as (span: typeof mockSpan) => unknown)(mockSpan);
        }
      ),
    }),
    getActiveSpan: vi.fn(() => mockSpan),
  },
}));

// Import after mock is set up
import { SpanStatusCode } from '@opentelemetry/api';
import { withSpan, addSpanEvent, setSpanAttributes } from './span-utils.js';

describe('withSpan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('executes function and returns result', async () => {
    const result = await withSpan('test-span', {}, async () => 'test-result');
    expect(result).toBe('test-result');
  });

  it('sets OK status on success', async () => {
    await withSpan('test-span', {}, async () => 'success');
    expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: SpanStatusCode.OK });
  });

  it('records exception and sets ERROR status on failure', async () => {
    const error = new Error('test error');

    await expect(
      withSpan('test-span', {}, async () => {
        throw error;
      })
    ).rejects.toThrow('test error');

    expect(mockSpan.setStatus).toHaveBeenCalledWith({
      code: SpanStatusCode.ERROR,
      message: 'test error',
    });
    expect(mockSpan.recordException).toHaveBeenCalledWith(error);
  });

  it('always ends the span', async () => {
    await withSpan('test-span', {}, async () => 'result');
    expect(mockSpan.end).toHaveBeenCalled();

    // Also verify it ends on error
    mockSpan.end.mockClear();
    try {
      await withSpan('test-span', {}, async () => {
        throw new Error('fail');
      });
    } catch {
      // Expected
    }
    expect(mockSpan.end).toHaveBeenCalled();
  });
});

describe('addSpanEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds event to active span', async () => {
    const { trace } = await import('@opentelemetry/api');
    vi.mocked(trace.getActiveSpan).mockReturnValue(
      mockSpan as unknown as ReturnType<typeof trace.getActiveSpan>
    );

    addSpanEvent('test-event', { key: 'value' });

    expect(mockSpan.addEvent).toHaveBeenCalledWith('test-event', { key: 'value' });
  });

  it('does nothing when no active span', async () => {
    const { trace } = await import('@opentelemetry/api');
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);

    // Should not throw
    expect(() => addSpanEvent('test-event')).not.toThrow();
  });
});

describe('setSpanAttributes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets attributes on active span', async () => {
    const { trace } = await import('@opentelemetry/api');
    vi.mocked(trace.getActiveSpan).mockReturnValue(
      mockSpan as unknown as ReturnType<typeof trace.getActiveSpan>
    );

    setSpanAttributes({ 'test.attr': 'value', 'test.number': 42 });

    expect(mockSpan.setAttributes).toHaveBeenCalledWith({
      'test.attr': 'value',
      'test.number': 42,
    });
  });

  it('does nothing when no active span', async () => {
    const { trace } = await import('@opentelemetry/api');
    vi.mocked(trace.getActiveSpan).mockReturnValue(undefined);

    // Should not throw
    expect(() => setSpanAttributes({ key: 'value' })).not.toThrow();
  });
});
