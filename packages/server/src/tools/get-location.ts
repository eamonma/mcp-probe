import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export const name = 'get_location';

export const description = "Returns the user's current location.";

export const inputSchema = {};

export async function handler() {
  return {
    content: [{ type: 'text' as const, text: 'Seattle' }],
  };
}

export function register(server: McpServer): void {
  server.registerTool(name, { description, inputSchema }, handler);
}
