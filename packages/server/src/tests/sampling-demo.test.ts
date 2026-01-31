import { describe, it, expect } from 'vitest';
import { createApp, initializeSession, mcpRequest } from './test-utils.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CreateMessageRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { registerAllTools } from '../tools/index.js';

describe('sampling_demo', () => {
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

    const tool = result.result.tools.find((t) => t.name === 'sampling_demo');
    expect(tool).toBeDefined();
    expect(tool!.description).toBeDefined();
    expect(tool!.inputSchema.properties.theme).toBeDefined();
    expect(tool!.inputSchema.properties.style).toBeDefined();
    expect(tool!.inputSchema.properties.maxTokens).toBeDefined();
  });

  it('returns sampled text when client supports sampling', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new McpServer(
      { name: 'sampling-demo-server', version: '1.0.0' },
      {
        capabilities: {
          tools: { listChanged: true },
          tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } },
        },
      }
    );

    registerAllTools(server);
    await server.connect(serverTransport);

    const client = new Client(
      { name: 'sampling-demo-client', version: '1.0.0' },
      { capabilities: { sampling: {} } }
    );

    client.setRequestHandler(CreateMessageRequestSchema, async () => ({
      model: 'demo-model',
      role: 'assistant',
      content: { type: 'text', text: 'Sampled response' },
    }));

    await client.connect(clientTransport);
    await client.listTools();

    const result = await client.callTool({
      name: 'sampling_demo',
      arguments: { theme: 'ocean', style: 'haiku', maxTokens: 64 },
    }) as { content: Array<{ type: string; text: string }> };

    expect(result.content[0].text).toContain('Sampled response');

    await client.close();
    await server.close();
  });

  it('returns error message when sampling fails', async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new McpServer(
      { name: 'sampling-demo-server', version: '1.0.0' },
      {
        capabilities: {
          tools: { listChanged: true },
          tasks: { list: {}, cancel: {}, requests: { tools: { call: {} } } },
        },
      }
    );

    registerAllTools(server);
    await server.connect(serverTransport);

    const client = new Client(
      { name: 'sampling-demo-client', version: '1.0.0' },
      { capabilities: { sampling: {} } }
    );

    client.setRequestHandler(CreateMessageRequestSchema, async () => {
      throw new Error('Sampling unavailable');
    });

    await client.connect(clientTransport);
    await client.listTools();

    const result = await client.callTool({
      name: 'sampling_demo',
      arguments: { theme: 'ocean', style: 'haiku', maxTokens: 64 },
    }) as { content: Array<{ type: string; text: string }>; isError?: boolean };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Sampling request failed');

    await client.close();
    await server.close();
  });
});
