// Re-exports for clean imports
export { getTracer } from './tracer.js';
export { withSpan, addSpanEvent, setSpanAttributes } from './span-utils.js';
export { MCP_ATTRIBUTES } from './attributes.js';
export { initOtel, registerShutdownHandler } from './otel-init.js';
