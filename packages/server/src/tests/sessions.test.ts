import { describe, it, expect } from 'vitest';
import { createApp, request, parseSSE } from './test-utils.js';

describe('multi-client sessions', () => {
  it('assigns unique session IDs to each client', async () => {
    const app = createApp();

    const response1 = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'client-a', version: '1.0.0' },
        },
      });

    const response2 = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'client-b', version: '1.0.0' },
        },
      });

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);

    const sessionId1 = response1.headers['mcp-session-id'];
    const sessionId2 = response2.headers['mcp-session-id'];

    expect(sessionId1).toBeDefined();
    expect(sessionId2).toBeDefined();
    expect(sessionId1).not.toBe(sessionId2);
  });

  it('isolates tasks between sessions', async () => {
    const app = createApp();

    const initA = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'client-a', version: '1.0.0' },
        },
      });
    const sessionIdA = initA.headers['mcp-session-id'];

    const initB = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'client-b', version: '1.0.0' },
        },
      });
    const sessionIdB = initB.headers['mcp-session-id'];

    const createTaskResponse = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Mcp-Session-Id', sessionIdA)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'pure_task',
          arguments: { durationMs: 5000 },
          task: { ttl: 60000 },
        },
      });

    const taskResult = parseSSE(createTaskResponse.text) as {
      result: { task: { taskId: string } };
    };
    const taskIdA = taskResult.result.task.taskId;

    const listB = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Mcp-Session-Id', sessionIdB)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tasks/list',
        params: {},
      });

    const listResultB = parseSSE(listB.text) as {
      result: { tasks: Array<{ taskId: string }> };
    };

    const foundTask = listResultB.result.tasks.find((t) => t.taskId === taskIdA);
    expect(foundTask).toBeUndefined();

    const listA = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Mcp-Session-Id', sessionIdA)
      .send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tasks/list',
        params: {},
      });

    const listResultA = parseSSE(listA.text) as {
      result: { tasks: Array<{ taskId: string }> };
    };

    const foundTaskA = listResultA.result.tasks.find((t) => t.taskId === taskIdA);
    expect(foundTaskA).toBeDefined();
  });

  it('debug endpoint shows all connected sessions', async () => {
    const app = createApp();

    const initA = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: { elicitation: { form: {} } },
          clientInfo: { name: 'client-with-elicitation', version: '1.0.0' },
        },
      });
    const sessionIdA = initA.headers['mcp-session-id'];

    const initB = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: { name: 'client-without-elicitation', version: '1.0.0' },
        },
      });
    const sessionIdB = initB.headers['mcp-session-id'];

    const debugResponse = await request(app).get('/debug/sessions');

    expect(debugResponse.status).toBe(200);
    expect(debugResponse.body.sessions).toBeDefined();
    expect(Object.keys(debugResponse.body.sessions).length).toBeGreaterThanOrEqual(2);

    const sessionA = debugResponse.body.sessions[sessionIdA];
    const sessionB = debugResponse.body.sessions[sessionIdB];

    expect(sessionA).toBeDefined();
    expect(sessionB).toBeDefined();
    expect(sessionA.clientInfo.name).toBe('client-with-elicitation');
    expect(sessionB.clientInfo.name).toBe('client-without-elicitation');
    expect(sessionA.capabilities.elicitation).toBeDefined();
    expect(sessionB.capabilities.elicitation).toBeUndefined();
  });

  it('rejects requests without valid session ID after initialization', async () => {
    const app = createApp();

    await request(app)
      .post('/mcp')
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

    const response = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Mcp-Session-Id', 'invalid-session-id')
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });

    expect([400, 404]).toContain(response.status);
  });

  it('allows session termination via DELETE', async () => {
    const app = createApp();

    const initResponse = await request(app)
      .post('/mcp')
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
    const sessionId = initResponse.headers['mcp-session-id'];

    const deleteResponse = await request(app)
      .delete('/mcp')
      .set('Mcp-Session-Id', sessionId);

    expect(deleteResponse.status).toBe(200);

    const postResponse = await request(app)
      .post('/mcp')
      .set('Accept', 'application/json, text/event-stream')
      .set('Content-Type', 'application/json')
      .set('Mcp-Session-Id', sessionId)
      .send({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {},
      });

    expect([400, 404]).toContain(postResponse.status);
  });
});
