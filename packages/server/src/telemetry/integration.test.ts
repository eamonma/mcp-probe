import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('OTEL integration', () => {
  it('telemetry import is first line in index.ts', () => {
    // Read the actual index.ts file
    const indexPath = resolve(__dirname, '../index.ts');
    const content = readFileSync(indexPath, 'utf-8');
    const lines = content.split('\n');

    // Find first non-empty, non-comment line
    const firstCodeLine = lines.find(
      (line) =>
        line.trim() !== '' &&
        !line.trim().startsWith('//') &&
        !line.trim().startsWith('/*') &&
        !line.trim().startsWith('*')
    );

    expect(firstCodeLine).toContain("import './telemetry/otel-init.js'");
  });

  it('all telemetry exports are available from index', async () => {
    const telemetry = await import('./index.js');

    expect(telemetry.getTracer).toBeDefined();
    expect(telemetry.withSpan).toBeDefined();
    expect(telemetry.addSpanEvent).toBeDefined();
    expect(telemetry.setSpanAttributes).toBeDefined();
    expect(telemetry.MCP_ATTRIBUTES).toBeDefined();
    expect(telemetry.initOtel).toBeDefined();
  });
});
