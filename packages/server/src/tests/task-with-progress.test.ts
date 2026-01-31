import { describe, it, expect } from 'vitest';
import { createApp, initializeSession, mcpRequest, request, parseAllSSEEvents } from './test-utils.js';

describe('task_with_progress', () => {
  it('is listed in tools/list with correct schema and taskSupport', async () => {
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
          execution?: { taskSupport?: string };
        }>;
      };
    };

    const tool = result.result.tools.find((t) => t.name === 'task_with_progress');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.properties.itemCount).toBeDefined();
    expect(tool!.inputSchema.properties.delayPerItemMs).toBeDefined();
    expect(tool!.execution?.taskSupport).toBe('required');
  });

  it('returns task handle when invoked with task param', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'task_with_progress',
        arguments: { itemCount: 3, delayPerItemMs: 10 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    expect(status).toBe(200);

    const result = body as {
      result: {
        task: {
          taskId: string;
          status: string;
        };
      };
    };

    expect(result.result.task).toBeDefined();
    expect(result.result.task.taskId).toBeDefined();
    expect(result.result.task.status).toBe('completed');
  });

  it('completes task and returns processedItems via tasks/result', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: startBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'task_with_progress',
        arguments: { itemCount: 3, delayPerItemMs: 10 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = startBody as {
      result: { task: { taskId: string } };
    };
    const taskId = taskResult.result.task.taskId;

    await new Promise((resolve) => setTimeout(resolve, 200));

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/result',
      params: { taskId },
    }, sessionId);

    expect(status).toBe(200);

    const result = body as {
      result: { content: Array<{ type: string; text: string }> };
    };

    expect(result.result.content).toBeDefined();
    const parsed = JSON.parse(result.result.content[0].text);
    expect(parsed.processedItems).toBe(3);
  });

  it('emits progress notifications during processing', async () => {
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
          name: 'task_with_progress',
          arguments: { itemCount: 3, delayPerItemMs: 10 },
          task: { ttl: 60000 },
          _meta: {
            progressToken: 'task-progress-token',
          },
        },
      });

    expect(response.status).toBe(200);

    const events = parseAllSSEEvents(response.text);
    const progressNotifications = events.filter(
      (e: any) => e.method === 'notifications/progress'
    );

    expect(progressNotifications.length).toBeGreaterThan(0);
    expect((progressNotifications[0] as any).params.progressToken).toBe('task-progress-token');
    expect((progressNotifications[0] as any).params.total).toBe(3);
  });
});
