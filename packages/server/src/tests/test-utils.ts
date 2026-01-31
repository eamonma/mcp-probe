import request from 'supertest';
import type { Express } from 'express';
import { createApp as createAppInternal } from '../app.js';

// Wrapper that returns just the Express app for backward compatibility
export function createApp(): Express {
  const result = createAppInternal();
  return result.app;
}

// Parse SSE response to extract JSON-RPC message
export function parseSSE(text: string): unknown {
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      return JSON.parse(line.slice(6));
    }
  }
  throw new Error('No data line found in SSE response');
}

// Parse all SSE events from response
export function parseAllSSEEvents(text: string): unknown[] {
  return text
    .split('\n\n')
    .filter((chunk) => chunk.includes('data: '))
    .map((chunk) => {
      const dataLine = chunk.split('\n').find((l) => l.startsWith('data: '));
      return dataLine ? JSON.parse(dataLine.slice(6)) : null;
    })
    .filter(Boolean);
}

// Helper to make MCP requests with session support
export async function mcpRequest(
  app: Express,
  body: object,
  sessionId?: string
): Promise<{ status: number; body: unknown; sessionId?: string }> {
  let req = request(app)
    .post('/mcp')
    .set('Accept', 'application/json, text/event-stream')
    .set('Content-Type', 'application/json');

  if (sessionId) {
    req = req.set('Mcp-Session-Id', sessionId);
  }

  const response = await req.send(body);

  return {
    status: response.status,
    body: response.headers['content-type']?.includes('text/event-stream')
      ? parseSSE(response.text)
      : response.body,
    sessionId: response.headers['mcp-session-id'],
  };
}

// Helper to initialize MCP session and return session ID
export async function initializeSession(app: Express): Promise<{ status: number; body: unknown; sessionId: string }> {
  const response = await request(app)
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

  return {
    status: response.status,
    body: response.headers['content-type']?.includes('text/event-stream')
      ? parseSSE(response.text)
      : response.body,
    sessionId: response.headers['mcp-session-id'],
  };
}

// Re-export request for convenience
export { request };
