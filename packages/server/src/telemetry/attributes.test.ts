import { describe, it, expect } from 'vitest';
import { MCP_ATTRIBUTES } from './attributes.js';

describe('MCP_ATTRIBUTES', () => {
  it('exports SESSION_ID attribute', () => {
    expect(MCP_ATTRIBUTES.SESSION_ID).toBe('mcp.session.id');
  });

  it('exports CLIENT_NAME attribute', () => {
    expect(MCP_ATTRIBUTES.CLIENT_NAME).toBe('mcp.client.name');
  });

  it('exports CLIENT_VERSION attribute', () => {
    expect(MCP_ATTRIBUTES.CLIENT_VERSION).toBe('mcp.client.version');
  });

  it('exports MESSAGE_TYPE attribute', () => {
    expect(MCP_ATTRIBUTES.MESSAGE_TYPE).toBe('mcp.message.type');
  });

  it('exports MESSAGE_METHOD attribute', () => {
    expect(MCP_ATTRIBUTES.MESSAGE_METHOD).toBe('mcp.message.method');
  });

  it('exports MESSAGE_ID attribute', () => {
    expect(MCP_ATTRIBUTES.MESSAGE_ID).toBe('mcp.message.id');
  });

  it('exports TOOL_NAME attribute', () => {
    expect(MCP_ATTRIBUTES.TOOL_NAME).toBe('mcp.tool.name');
  });

  it('exports TASK_ID attribute', () => {
    expect(MCP_ATTRIBUTES.TASK_ID).toBe('mcp.task.id');
  });

  it('exports ERROR_CODE attribute', () => {
    expect(MCP_ATTRIBUTES.ERROR_CODE).toBe('mcp.error.code');
  });
});
