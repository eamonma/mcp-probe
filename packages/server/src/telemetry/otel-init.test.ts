import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies before imports
vi.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    shutdown: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: vi.fn(() => []),
}));

vi.mock('@azure/monitor-opentelemetry-exporter', () => ({
  AzureMonitorTraceExporter: vi.fn(),
}));

vi.mock('@opentelemetry/resources', () => ({
  Resource: vi.fn(),
}));

vi.mock('@opentelemetry/semantic-conventions', () => ({
  ATTR_SERVICE_NAME: 'service.name',
  ATTR_SERVICE_VERSION: 'service.version',
}));

describe('OTEL Initialization', () => {
  const originalEnv = process.env;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('does not initialize SDK when OTEL_ENABLED is false', async () => {
    process.env.OTEL_ENABLED = 'false';

    const { initOtel } = await import('./otel-init.js');
    const sdk = initOtel();

    expect(sdk).toBeUndefined();
    expect(consoleLogSpy).toHaveBeenCalledWith('[OTEL] OpenTelemetry disabled');
  });

  it('does not initialize SDK when OTEL_ENABLED is unset', async () => {
    delete process.env.OTEL_ENABLED;

    const { initOtel } = await import('./otel-init.js');
    const sdk = initOtel();

    expect(sdk).toBeUndefined();
    expect(consoleLogSpy).toHaveBeenCalledWith('[OTEL] OpenTelemetry disabled');
  });

  it('warns when OTEL_ENABLED=true but no connection string', async () => {
    process.env.OTEL_ENABLED = 'true';
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING;

    const { initOtel } = await import('./otel-init.js');
    const sdk = initOtel();

    expect(sdk).toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[OTEL] OTEL_ENABLED=true but APPLICATIONINSIGHTS_CONNECTION_STRING is not set'
    );
  });

  it('initializes SDK when OTEL_ENABLED=true and connection string provided', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test-key';

    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { initOtel } = await import('./otel-init.js');
    const sdk = initOtel();

    expect(sdk).toBeDefined();
    expect(NodeSDK).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(
      '[OTEL] OpenTelemetry initialized with Azure Monitor exporter'
    );
  });

  it('uses BUILD_ID for service version', async () => {
    process.env.OTEL_ENABLED = 'true';
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test-key';
    process.env.BUILD_ID = 'abc123';

    const { Resource } = await import('@opentelemetry/resources');
    const { initOtel } = await import('./otel-init.js');
    initOtel();

    expect(Resource).toHaveBeenCalledWith(
      expect.objectContaining({
        'service.version': 'abc123',
      })
    );
  });
});
