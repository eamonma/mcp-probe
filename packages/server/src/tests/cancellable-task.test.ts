import { describe, it, expect } from 'vitest';
import { createApp, initializeSession, mcpRequest, request, parseAllSSEEvents } from './test-utils.js';

describe('cancellable_task', () => {
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

    const tool = result.result.tools.find((t) => t.name === 'cancellable_task');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.properties.durationMs).toBeDefined();
    expect(tool!.execution?.taskSupport).toBe('required');
  });

  it('returns task handle in working status', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const taskPromise = mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'cancellable_task',
        arguments: { durationMs: 10000 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const { body: listBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/list',
      params: {},
    }, sessionId);

    const listResult = listBody as {
      result: { tasks: Array<{ taskId: string; status: string }> };
    };

    const runningTask = listResult.result.tasks.find(t => t.status === 'working');
    expect(runningTask).toBeDefined();

    if (runningTask) {
      await mcpRequest(app, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tasks/cancel',
        params: { taskId: runningTask.taskId },
      }, sessionId);
    }

    const { status, body } = await taskPromise;

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
    expect(['working', 'cancelled']).toContain(result.result.task.status);
  }, 15000);

  it('can be cancelled via tasks/cancel', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const taskPromise = mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'cancellable_task',
        arguments: { durationMs: 10000 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const { body: listBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/list',
      params: {},
    }, sessionId);

    const listResult = listBody as {
      result: { tasks: Array<{ taskId: string; status: string }> };
    };

    const runningTask = listResult.result.tasks.find(t => t.status === 'working');
    expect(runningTask).toBeDefined();
    const taskId = runningTask!.taskId;

    const { status } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tasks/cancel',
      params: { taskId },
    }, sessionId);

    expect(status).toBe(200);

    await taskPromise;

    const { body: getBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tasks/get',
      params: { taskId },
    }, sessionId);

    const getResult = getBody as {
      result: { taskId: string; status: string };
    };

    expect(getResult.result.status).toBe('cancelled');
  }, 15000);

  it('rejects cancel for already-terminal tasks with error code -32602', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const taskPromise = mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'cancellable_task',
        arguments: { durationMs: 10000 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    await new Promise((resolve) => setTimeout(resolve, 500));

    const { body: listBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/list',
      params: {},
    }, sessionId);

    const listResult = listBody as {
      result: { tasks: Array<{ taskId: string; status: string }> };
    };

    const runningTask = listResult.result.tasks.find(t => t.status === 'working');
    expect(runningTask).toBeDefined();
    const taskId = runningTask!.taskId;

    await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tasks/cancel',
      params: { taskId },
    }, sessionId);

    await taskPromise;

    const { body: cancelBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tasks/cancel',
      params: { taskId },
    }, sessionId);

    const cancelResult = cancelBody as {
      error?: { code: number; message: string };
    };

    expect(cancelResult.error).toBeDefined();
    expect(cancelResult.error!.code).toBe(-32602);
  }, 15000);

  it('emits progress notifications every second', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const taskPromise = request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Mcp-Session-Id', sessionId)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'cancellable_task',
          arguments: { durationMs: 10000 },
          task: { ttl: 60000 },
          _meta: { progressToken: 'cancel-progress-token' },
        },
      });

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const { body: listBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/list',
      params: {},
    }, sessionId);

    const listResult = listBody as {
      result: { tasks: Array<{ taskId: string; status: string }> };
    };

    const runningTask = listResult.result.tasks.find(t => t.status === 'working');
    if (runningTask) {
      await mcpRequest(app, {
        jsonrpc: '2.0',
        id: 4,
        method: 'tasks/cancel',
        params: { taskId: runningTask.taskId },
      }, sessionId);
    }

    const response = await taskPromise;

    expect(response.status).toBe(200);

    const events = parseAllSSEEvents(response.text);
    const progressNotifications = events.filter(
      (e: any) => e.method === 'notifications/progress'
    );

    expect(progressNotifications.length).toBeGreaterThanOrEqual(2);
    expect((progressNotifications[0] as any).params.progressToken).toBe('cancel-progress-token');
    expect((progressNotifications[0] as any).params.total).toBe(10);
    expect((progressNotifications[0] as any).params.message).toContain('1s');
  }, 15000);
});
