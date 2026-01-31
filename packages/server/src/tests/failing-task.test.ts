import { describe, it, expect } from 'vitest';
import { createApp, initializeSession, mcpRequest } from './test-utils.js';

describe('failing_task', () => {
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

    const tool = result.result.tools.find((t) => t.name === 'failing_task');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.properties.failAfterMs).toBeDefined();
    expect(tool!.inputSchema.properties.errorCode).toBeDefined();
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
        name: 'failing_task',
        arguments: { failAfterMs: 1000, errorCode: 'internal' },
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

  it('transitions to failed state with timeout error', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: startBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'failing_task',
        arguments: { failAfterMs: 1000, errorCode: 'timeout' },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = startBody as {
      result: { task: { taskId: string } };
    };
    const taskId = taskResult.result.task.taskId;

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const { body: getBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/get',
      params: { taskId },
    }, sessionId);

    const getResult = getBody as {
      result: { taskId: string; status: string };
    };

    expect(getResult.result.status).toBe('failed');
  });

  it('transitions to failed state with internal error', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: startBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'failing_task',
        arguments: { failAfterMs: 1000, errorCode: 'internal' },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = startBody as {
      result: { task: { taskId: string } };
    };
    const taskId = taskResult.result.task.taskId;

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const { body: getBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/get',
      params: { taskId },
    }, sessionId);

    const getResult = getBody as {
      result: { taskId: string; status: string };
    };

    expect(getResult.result.status).toBe('failed');
  });

  it('transitions to failed state with validation error', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: startBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'failing_task',
        arguments: { failAfterMs: 1000, errorCode: 'validation' },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = startBody as {
      result: { task: { taskId: string } };
    };
    const taskId = taskResult.result.task.taskId;

    await new Promise((resolve) => setTimeout(resolve, 1200));

    const { body: getBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/get',
      params: { taskId },
    }, sessionId);

    const getResult = getBody as {
      result: { taskId: string; status: string };
    };

    expect(getResult.result.status).toBe('failed');
  });

  it('includes statusMessage with diagnostic info when task fails', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: startBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'failing_task',
        arguments: { failAfterMs: 1000, errorCode: 'internal' },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = startBody as {
      result: { task: { taskId: string } };
    };
    const taskId = taskResult.result.task.taskId;

    // Wait for task to fail
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const { body: getBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/get',
      params: { taskId },
    }, sessionId);

    const getResult = getBody as {
      result: { taskId: string; status: string; statusMessage?: string };
    };

    expect(getResult.result.status).toBe('failed');
    // Per MCP spec: "The tasks/get response SHOULD include a statusMessage field with diagnostic information about the failure"
    expect(getResult.result.statusMessage).toBeDefined();
    expect(getResult.result.statusMessage).toContain('internal');
  });
});
