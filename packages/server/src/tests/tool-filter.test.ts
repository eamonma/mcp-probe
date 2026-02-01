import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp, parseSSE } from './test-utils.js';

describe('Tool filtering via query parameter', () => {
  // Helper to initialize a session with optional tools filter
  async function initializeWithFilter(
    app: ReturnType<typeof createApp>,
    tools?: string[]
  ): Promise<{ status: number; body: unknown; sessionId: string }> {
    const url = tools ? `/mcp?tools=${tools.join(',')}` : '/mcp';

    const response = await request(app)
      .post(url)
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        },
      });

    return {
      status: response.status,
      body: response.headers['content-type']?.includes('text/event-stream')
        ? parseSSE(response.text)
        : response.body,
      sessionId: response.headers['mcp-session-id'],
    };
  }

  // Helper to list tools for a session
  async function listTools(
    app: ReturnType<typeof createApp>,
    sessionId: string
  ): Promise<{ status: number; body: unknown }> {
    const response = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Mcp-Session-Id', sessionId)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
      });

    return {
      status: response.status,
      body: response.headers['content-type']?.includes('text/event-stream')
        ? parseSSE(response.text)
        : response.body,
    };
  }

  it('returns all tools when no filter is specified', async () => {
    const app = createApp();
    const { sessionId } = await initializeWithFilter(app);

    const { body } = await listTools(app, sessionId);
    const result = body as { result: { tools: { name: string }[] } };

    // Should have all 10 tools
    expect(result.result.tools.length).toBe(10);
  });

  it('returns only specified tools when filter is provided', async () => {
    const app = createApp();
    const { sessionId } = await initializeWithFilter(app, ['simple_tool', 'pure_task']);

    const { body } = await listTools(app, sessionId);
    const result = body as { result: { tools: { name: string }[] } };

    expect(result.result.tools.length).toBe(2);
    const toolNames = result.result.tools.map((t) => t.name);
    expect(toolNames).toContain('simple_tool');
    expect(toolNames).toContain('pure_task');
  });

  it('returns only one tool when single tool is specified', async () => {
    const app = createApp();
    const { sessionId } = await initializeWithFilter(app, ['simple_tool']);

    const { body } = await listTools(app, sessionId);
    const result = body as { result: { tools: { name: string }[] } };

    expect(result.result.tools.length).toBe(1);
    expect(result.result.tools[0].name).toBe('simple_tool');
  });

  it('ignores invalid tool names in filter', async () => {
    const app = createApp();
    const { sessionId } = await initializeWithFilter(app, [
      'simple_tool',
      'invalid_tool_name',
      'pure_task',
    ]);

    const { body } = await listTools(app, sessionId);
    const result = body as { result: { tools: { name: string }[] } };

    // Should only have the 2 valid tools
    expect(result.result.tools.length).toBe(2);
    const toolNames = result.result.tools.map((t) => t.name);
    expect(toolNames).toContain('simple_tool');
    expect(toolNames).toContain('pure_task');
    expect(toolNames).not.toContain('invalid_tool_name');
  });

  it('returns no tools when all filter values are invalid', async () => {
    const app = createApp();
    const { sessionId } = await initializeWithFilter(app, ['invalid1', 'invalid2']);

    const { body } = await listTools(app, sessionId);
    const result = body as { result?: { tools: { name: string }[] } };

    // When no tools are registered, the result may have an empty tools array or no tools property
    const tools = result.result?.tools ?? [];
    expect(tools.length).toBe(0);
  });
});
