import { describe, it, expect } from 'vitest';
import { createApp, initializeSession, mcpRequest } from './test-utils.js';

describe('pure_task', () => {
  it('is listed in tools/list with taskSupport', async () => {
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

    const tool = result.result.tools.find((t) => t.name === 'pure_task');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.properties.durationMs).toBeDefined();
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
        name: 'pure_task',
        arguments: { durationMs: 1000 },
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
    expect(result.result.task.status).toBe('working');
  });

  it('completes task and returns result via tasks/result', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: startBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'pure_task',
        arguments: { durationMs: 1000 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = startBody as {
      result: { task: { taskId: string } };
    };
    const taskId = taskResult.result.task.taskId;

    await new Promise((resolve) => setTimeout(resolve, 1200));

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
    expect(result.result.content[0].text).toContain('completed');
  });

  it('can poll task status via tasks/get', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: createBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'pure_task',
        arguments: { durationMs: 1000 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = createBody as {
      result: { task: { taskId: string; status: string } };
    };
    const taskId = taskResult.result.task.taskId;

    expect(taskResult.result.task.status).toBe('working');

    const { body: getBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/get',
      params: { taskId },
    }, sessionId);

    const getResult = getBody as {
      result: { taskId: string; status: string };
    };

    expect(getResult.result.taskId).toBe(taskId);
    expect(['working', 'completed']).toContain(getResult.result.status);
  });

  it('includes createdAt and lastUpdatedAt timestamps in task responses', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: createBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'pure_task',
        arguments: { durationMs: 2000 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = createBody as {
      result: {
        task: {
          taskId: string;
          status: string;
          createdAt?: string;
          lastUpdatedAt?: string;
        };
      };
    };

    // Per MCP spec: "Receivers MUST include a createdAt ISO 8601-formatted timestamp in all task responses"
    expect(taskResult.result.task.createdAt).toBeDefined();
    expect(typeof taskResult.result.task.createdAt).toBe('string');
    // Verify ISO 8601 format
    expect(() => new Date(taskResult.result.task.createdAt!)).not.toThrow();
    expect(new Date(taskResult.result.task.createdAt!).toISOString()).toBeTruthy();

    // Per MCP spec: "Receivers MUST include a lastUpdatedAt ISO 8601-formatted timestamp in all task responses"
    expect(taskResult.result.task.lastUpdatedAt).toBeDefined();
    expect(typeof taskResult.result.task.lastUpdatedAt).toBe('string');
    expect(() => new Date(taskResult.result.task.lastUpdatedAt!)).not.toThrow();

    // Also verify via tasks/get
    const { body: getBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/get',
      params: { taskId: taskResult.result.task.taskId },
    }, sessionId);

    const getResult = getBody as {
      result: {
        taskId: string;
        createdAt?: string;
        lastUpdatedAt?: string;
      };
    };

    expect(getResult.result.createdAt).toBeDefined();
    expect(getResult.result.lastUpdatedAt).toBeDefined();
  });

  it('includes io.modelcontextprotocol/related-task metadata in tasks/result response', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: startBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'pure_task',
        arguments: { durationMs: 1000 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = startBody as {
      result: { task: { taskId: string } };
    };
    const taskId = taskResult.result.task.taskId;

    // Wait for task to complete
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const { body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/result',
      params: { taskId },
    }, sessionId);

    const result = body as {
      result: {
        content: Array<{ type: string; text: string }>;
        _meta?: {
          'io.modelcontextprotocol/related-task'?: {
            taskId: string;
          };
        };
      };
    };

    // Per MCP spec: "The tasks/result operation MUST include this metadata in its response"
    expect(result.result._meta).toBeDefined();
    expect(result.result._meta!['io.modelcontextprotocol/related-task']).toBeDefined();
    expect(result.result._meta!['io.modelcontextprotocol/related-task']!.taskId).toBe(taskId);
  });
});
