import { describe, it, expect } from 'vitest';
import { createApp, initializeSession, mcpRequest } from './test-utils.js';

describe('pausable_task', () => {
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

    const tool = result.result.tools.find((t) => t.name === 'pausable_task');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.properties.itemCount).toBeDefined();
    expect(tool!.inputSchema.properties.pauseAfterItem).toBeDefined();
    expect(tool!.execution?.taskSupport).toBe('required');
  });

  it('returns task handle when invoked', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { status, body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'pausable_task',
        arguments: { itemCount: 10, pauseAfterItem: 5 },
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
  });

  it('transitions to input_required state after pauseAfterItem', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: startBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'pausable_task',
        arguments: { itemCount: 10, pauseAfterItem: 3 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = startBody as {
      result: { task: { taskId: string } };
    };
    const taskId = taskResult.result.task.taskId;

    await new Promise((resolve) => setTimeout(resolve, 500));

    const { body: getBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/get',
      params: { taskId },
    }, sessionId);

    const getResult = getBody as {
      result: { taskId: string; status: string };
    };

    expect(getResult.result.status).toBe('input_required');
  });

  it('includes statusMessage when paused', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: startBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'pausable_task',
        arguments: { itemCount: 10, pauseAfterItem: 3 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = startBody as {
      result: { task: { taskId: string } };
    };
    const taskId = taskResult.result.task.taskId;

    await new Promise((resolve) => setTimeout(resolve, 500));

    const { body: getBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/get',
      params: { taskId },
    }, sessionId);

    const getResult = getBody as {
      result: { taskId: string; status: string; statusMessage?: string };
    };

    expect(getResult.result.status).toBe('input_required');
    expect(getResult.result.statusMessage).toBeDefined();
    expect(getResult.result.statusMessage).toContain('Waiting for user');
  });
});
