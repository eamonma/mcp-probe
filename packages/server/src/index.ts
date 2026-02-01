// OTEL must be initialized BEFORE any other imports
// This side-effect import self-initializes OTEL synchronously
import './telemetry/otel-init.js';

// Dynamic import to ensure Express/HTTP are loaded AFTER OTEL patches them
async function main() {
  const { createApp } = await import('./app.js');
  type AppWithObservability = import('./app.js').AppWithObservability;

  const PORT = process.env.PORT ?? 3000;
  const OBSERVABILITY_ENABLED = process.env.OBSERVABILITY === 'true';

  const result = createApp({
    observability: OBSERVABILITY_ENABLED
      ? {
          enabled: true,
          maxEventsPerSession: parseInt(process.env.OBSERVABILITY_MAX_EVENTS ?? '1000', 10),
        }
      : undefined,
  });

  if ('server' in result) {
    // Observability enabled - use HTTP server with WebSocket
    const { server } = result as AppWithObservability;

    server.listen(PORT, () => {
      console.log(`MCP Probe server listening on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Observability: enabled`);
      console.log(`  - Events API: http://localhost:${PORT}/api/events/sessions`);
      console.log(`  - WebSocket: ws://localhost:${PORT}/events`);
    });
  } else {
    // Observability disabled - use Express app directly
    const { app } = result;

    app.listen(PORT, () => {
      console.log(`MCP Probe server listening on http://localhost:${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`Observability: disabled (set OBSERVABILITY=true to enable)`);
    });
  }
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
