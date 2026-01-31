import { describe, it, expect } from 'vitest';
import { createApp, initializeSession, mcpRequest } from './test-utils.js';

describe('simple_tool', () => {
  it('is listed in tools/list', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }, sessionId);

    expect(status).toBe(200);

    const result = body as {
      result: {
        tools: Array<{
          name: string;
          description: string;
          inputSchema: { properties: { delayMs: unknown } };
        }>;
      };
    };

    expect(result.result.tools).toBeDefined();

    const simpleTool = result.result.tools.find((t) => t.name === 'simple_tool');
    expect(simpleTool).toBeDefined();
    expect(simpleTool!.description).toBeDefined();
    expect(simpleTool!.inputSchema.properties.delayMs).toBeDefined();
  });

  it('returns success message after delay', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'simple_tool',
        arguments: { delayMs: 0 },
      },
    }, sessionId);

    expect(status).toBe(200);

    const result = body as {
      result: { content: Array<{ type: string; text: string }> };
    };

    expect(result.result.content).toBeDefined();
    expect(result.result.content[0].type).toBe('text');
    expect(result.result.content[0].text).toBe('Completed after 0ms');
  });

  it('validates delayMs is within bounds (0-5000)', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'simple_tool',
        arguments: { delayMs: 10000 },
      },
    }, sessionId);

    expect(status).toBe(200);

    const result = body as {
      result: { isError: boolean };
    };

    expect(result.result.isError).toBe(true);
  });
});
