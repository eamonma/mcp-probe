import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// Create mock function at module level (before vi.mock)
const mockSetSpanAttributes = vi.fn();

// Mock the telemetry module
vi.mock('./telemetry/index.js', () => {
  return {
    setSpanAttributes: (...args: unknown[]) => mockSetSpanAttributes(...args),
    MCP_ATTRIBUTES: {
      SESSION_ID: 'mcp.session.id',
      CLIENT_NAME: 'mcp.client.name',
      CLIENT_VERSION: 'mcp.client.version',
      MESSAGE_TYPE: 'mcp.message.type',
      MESSAGE_METHOD: 'mcp.message.method',
      MESSAGE_ID: 'mcp.message.id',
      TOOL_NAME: 'mcp.tool.name',
      TASK_ID: 'mcp.task.id',
      ERROR_CODE: 'mcp.error.code',
    },
  };
});

import { createApp } from './app.js';

describe('POST /mcp with OTEL', () => {
  beforeEach(() => {
    mockSetSpanAttributes.mockClear();
  });

  it('adds mcp.message.method attribute to span on initialize', async () => {
    const { app } = createApp();

    await request(app)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          clientInfo: { name: 'test-client', version: '1.0.0' },
          capabilities: {},
          protocolVersion: '2024-11-05',
        },
        id: 1,
      });

    expect(mockSetSpanAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'mcp.message.method': 'initialize',
      })
    );
  });

  it('adds mcp.message.id attribute for requests', async () => {
    const { app } = createApp();

    await request(app)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          clientInfo: { name: 'test-client', version: '1.0.0' },
          capabilities: {},
          protocolVersion: '2024-11-05',
        },
        id: 42,
      });

    expect(mockSetSpanAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'mcp.message.id': '42',
      })
    );
  });

  it('adds client info attributes on initialize', async () => {
    const { app } = createApp();

    await request(app)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          clientInfo: { name: 'awesome-client', version: '2.0.0' },
          capabilities: {},
          protocolVersion: '2024-11-05',
        },
        id: 1,
      });

    expect(mockSetSpanAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'mcp.client.name': 'awesome-client',
        'mcp.client.version': '2.0.0',
      })
    );
  });

  it('adds mcp.message.type attribute for requests vs notifications', async () => {
    const { app } = createApp();

    await request(app)
      .post('/mcp')
      .send({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          clientInfo: { name: 'test-client', version: '1.0.0' },
          capabilities: {},
          protocolVersion: '2024-11-05',
        },
        id: 1,
      });

    expect(mockSetSpanAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        'mcp.message.type': 'request',
      })
    );
  });
});
