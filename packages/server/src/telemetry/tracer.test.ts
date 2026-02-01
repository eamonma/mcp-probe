import { describe, it, expect, vi } from 'vitest';

const mockTracer = { name: 'mock-tracer' };

vi.mock('@opentelemetry/api', () => ({
  trace: {
    getTracer: vi.fn(() => mockTracer),
  },
}));

import { trace } from '@opentelemetry/api';
import { getTracer } from './tracer.js';

describe('getTracer', () => {
  it('returns a tracer with correct name', () => {
    const tracer = getTracer();

    expect(trace.getTracer).toHaveBeenCalledWith('mcp-probe');
    expect(tracer).toBe(mockTracer);
  });
});
