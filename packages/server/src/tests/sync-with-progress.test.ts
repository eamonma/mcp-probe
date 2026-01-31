import { describe, it, expect } from 'vitest';
import { createApp, initializeSession, mcpRequest, request, parseAllSSEEvents } from './test-utils.js';

describe('sync_with_progress', () => {
  it('is listed in tools/list with correct schema', async () => {
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
          inputSchema: { properties: Record<string, unknown> };
        }>;
      };
    };

    const tool = result.result.tools.find((t) => t.name === 'sync_with_progress');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.properties.itemCount).toBeDefined();
    expect(tool!.inputSchema.properties.delayPerItemMs).toBeDefined();
    expect(tool!.inputSchema.properties.mode).toBeDefined();
  });

  it('returns processedItems count after completion', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'sync_with_progress',
        arguments: {
          itemCount: 3,
          delayPerItemMs: 10,
          mode: 'determinate',
        },
      },
    }, sessionId);

    expect(status).toBe(200);

    const result = body as {
      result: { content: Array<{ type: string; text: string }> };
    };

    expect(result.result.content).toBeDefined();
    expect(result.result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.result.content[0].text);
    expect(parsed.processedItems).toBe(3);
  });

  it('sends progress notifications in determinate mode with total', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const response = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Mcp-Session-Id', sessionId)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'sync_with_progress',
          arguments: {
            itemCount: 3,
            delayPerItemMs: 10,
            mode: 'determinate',
          },
          _meta: {
            progressToken: 'test-progress-token',
          },
        },
      });

    expect(response.status).toBe(200);

    const events = parseAllSSEEvents(response.text);
    const progressNotifications = events.filter(
      (e: any) => e.method === 'notifications/progress'
    );

    expect(progressNotifications.length).toBeGreaterThan(0);
    expect((progressNotifications[0] as any).params.total).toBe(3);
    expect((progressNotifications[0] as any).params.progressToken).toBe('test-progress-token');
  });

  it('sends progress notifications in indeterminate mode without total', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const response = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Mcp-Session-Id', sessionId)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'sync_with_progress',
          arguments: {
            itemCount: 3,
            delayPerItemMs: 10,
            mode: 'indeterminate',
          },
          _meta: {
            progressToken: 'test-progress-token-2',
          },
        },
      });

    expect(response.status).toBe(200);

    const events = parseAllSSEEvents(response.text);
    const progressNotifications = events.filter(
      (e: any) => e.method === 'notifications/progress'
    );

    expect(progressNotifications.length).toBeGreaterThan(0);
    expect((progressNotifications[0] as any).params.total).toBeUndefined();
    expect((progressNotifications[0] as any).params.progressToken).toBe('test-progress-token-2');
  });
});
