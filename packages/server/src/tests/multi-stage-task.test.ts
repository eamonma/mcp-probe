import { describe, it, expect } from 'vitest';
import { createApp, initializeSession, mcpRequest, request, parseAllSSEEvents } from './test-utils.js';

describe('multi_stage_task', () => {
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

    const tool = result.result.tools.find((t) => t.name === 'multi_stage_task');
    expect(tool).toBeDefined();
    expect(tool!.inputSchema.properties.stageCount).toBeDefined();
    expect(tool!.inputSchema.properties.msPerStage).toBeDefined();
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
        name: 'multi_stage_task',
        arguments: { stageCount: 2, msPerStage: 500 },
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

  it('emits progress notifications with stage messages', async () => {
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
          name: 'multi_stage_task',
          arguments: { stageCount: 3, msPerStage: 500 },
          task: { ttl: 60000 },
          _meta: { progressToken: 'stage-progress-token' },
        },
      });

    expect(response.status).toBe(200);

    const events = parseAllSSEEvents(response.text);
    const progressNotifications = events.filter(
      (e: any) => e.method === 'notifications/progress'
    );

    expect(progressNotifications.length).toBe(3);
    expect((progressNotifications[0] as any).params.total).toBe(3);
    expect((progressNotifications[0] as any).params.message).toContain('Stage 1');
    expect((progressNotifications[1] as any).params.message).toContain('Stage 2');
    expect((progressNotifications[2] as any).params.message).toContain('Stage 3');
  });

  it('result contains list of stages completed', async () => {
    const app = createApp();
    const { sessionId } = await initializeSession(app);

    const { body: startBody } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'multi_stage_task',
        arguments: { stageCount: 3, msPerStage: 500 },
        task: { ttl: 60000 },
      },
    }, sessionId);

    const taskResult = startBody as {
      result: { task: { taskId: string } };
    };
    const taskId = taskResult.result.task.taskId;

    const { body } = await mcpRequest(app, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tasks/result',
      params: { taskId },
    }, sessionId);

    const result = body as {
      result: { content: Array<{ type: string; text: string }> };
    };

    const parsed = JSON.parse(result.result.content[0].text);
    expect(parsed.stagesCompleted).toEqual([
      'Initializing',
      'Processing',
      'Finalizing',
    ]);
  });
});
