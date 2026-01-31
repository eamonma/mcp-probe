import { describe, it, expect } from 'vitest';
import { createApp, initializeSession } from './test-utils.js';

describe('MCP endpoint', () => {
  it('responds to initialize request', async () => {
    const app = createApp();
    const { status, body } = await initializeSession(app);

    expect(status).toBe(200);

    const result = body as {
      jsonrpc: string;
      id: number;
      result: { protocolVersion: string; serverInfo: { name: string } };
    };

    expect(result.jsonrpc).toBe('2.0');
    expect(result.id).toBe(1);
    expect(result.result).toBeDefined();
    expect(result.result.protocolVersion).toBeDefined();
    expect(result.result.serverInfo).toBeDefined();
    expect(result.result.serverInfo.name).toBe('mcp-probe');
  });
});
