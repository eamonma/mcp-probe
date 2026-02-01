import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { AzureMonitorTraceExporter } from '@azure/monitor-opentelemetry-exporter';
import { Resource } from '@opentelemetry/resources';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

/**
 * Initialize OpenTelemetry with Azure Monitor exporter.
 * Returns the SDK instance if initialized, undefined otherwise.
 */
export function initOtel(): NodeSDK | undefined {
  const OTEL_ENABLED = process.env.OTEL_ENABLED === 'true';
  const CONNECTION_STRING = process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

  if (!OTEL_ENABLED) {
    console.log('[OTEL] OpenTelemetry disabled');
    return undefined;
  }

  if (!CONNECTION_STRING) {
    console.warn(
      '[OTEL] OTEL_ENABLED=true but APPLICATIONINSIGHTS_CONNECTION_STRING is not set'
    );
    return undefined;
  }

  const traceExporter = new AzureMonitorTraceExporter({
    connectionString: CONNECTION_STRING,
  });

  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: 'mcp-probe',
      [ATTR_SERVICE_VERSION]: process.env.BUILD_ID ?? 'unknown',
    }),
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
        '@opentelemetry/instrumentation-net': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log('[OTEL] OpenTelemetry initialized with Azure Monitor exporter');

  return sdk;
}

// Graceful shutdown handler
export function registerShutdownHandler(sdkInstance: NodeSDK): void {
  process.on('SIGTERM', () => {
    if (!sdkInstance) return;
    sdkInstance
      .shutdown()
      .then(() => console.log('[OTEL] SDK shut down'))
      .catch((err) => console.error('[OTEL] Shutdown error:', err));
  });
}

// Self-executing: initialize OTEL when this module is imported
// This MUST happen before any other application modules are imported
let sdk: NodeSDK | undefined;

// Skip auto-initialization in test environment to allow proper mocking
const isTestEnv = typeof process !== 'undefined' &&
  (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test');

if (!isTestEnv) {
  sdk = initOtel();
  if (sdk) {
    registerShutdownHandler(sdk);
  }
}

export { sdk };
