import { describe, it, expect } from 'vitest';
import { createApp, initializeSession, mcpRequest } from './test-utils.js';

describe('get_location tool', () => {
  it('returns Seattle as the location', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_location',
        arguments: {},
      },
    }, sessionId);

    expect(status).toBe(200);

    const result = body as { result: { content: { type: string; text: string }[] } };
    expect(result.result.content[0].text).toBe('Seattle');
  });

  it('is listed in available tools', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }, sessionId);

    expect(status).toBe(200);

    const result = body as { result: { tools: { name: string }[] } };
    const toolNames = result.result.tools.map((t) => t.name);
    expect(toolNames).toContain('get_location');
  });
});

describe('get_weather tool', () => {
  it('returns weather for given location', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_weather',
        arguments: { location: 'Seattle' },
      },
    }, sessionId);

    expect(status).toBe(200);

    const result = body as { result: { content: { type: string; text: string }[] } };
    expect(result.result.content[0].text).toContain('Seattle');
    expect(result.result.content[0].text).toContain('weather');
  });

  it('is listed in available tools', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: {},
    }, sessionId);

    expect(status).toBe(200);

    const result = body as { result: { tools: { name: string }[] } };
    const toolNames = result.result.tools.map((t) => t.name);
    expect(toolNames).toContain('get_weather');
  });

  it('includes the location in the response', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'get_weather',
        arguments: { location: 'New York' },
      },
    }, sessionId);

    expect(status).toBe(200);

    const result = body as { result: { content: { type: string; text: string }[] } };
    expect(result.result.content[0].text).toContain('New York');
  });
});
