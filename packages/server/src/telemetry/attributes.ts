/**
 * Custom semantic attributes for MCP Probe.
 * Following OpenTelemetry naming conventions.
 */
export const MCP_ATTRIBUTES = {
  // Session attributes
  SESSION_ID: 'mcp.session.id',
  CLIENT_NAME: 'mcp.client.name',
  CLIENT_VERSION: 'mcp.client.version',

  // Message attributes
  MESSAGE_TYPE: 'mcp.message.type',
  MESSAGE_METHOD: 'mcp.message.method',
  MESSAGE_ID: 'mcp.message.id',

  // Tool attributes
  TOOL_NAME: 'mcp.tool.name',
  TASK_ID: 'mcp.task.id',

  // Error attributes
  ERROR_CODE: 'mcp.error.code',
} as const;
