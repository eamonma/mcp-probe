import { trace, Tracer } from '@opentelemetry/api';

const TRACER_NAME = 'mcp-probe';

/**
 * Get the application tracer for creating manual spans.
 */
export function getTracer(): Tracer {
  return trace.getTracer(TRACER_NAME);
}
