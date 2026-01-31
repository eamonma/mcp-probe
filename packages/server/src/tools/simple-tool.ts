import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const name = 'simple_tool';

export const description = 'Baseline validation that the client can invoke a tool and receive a response.';

export const inputSchema = {
  delayMs: z.number().min(0).max(5000).describe('Delay in milliseconds (0-5000)'),
};

export async function handler({ delayMs }: { delayMs: number }) {
  // Validate bounds (schema should catch this, but double-check for error response)
  if (delayMs < 0 || delayMs > 5000) {
    return {
      content: [{ type: 'text' as const, text: `delayMs must be between 0 and 5000, got ${delayMs}` }],
      isError: true,
    };
  }

  // Wait for the specified delay
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  return {
    content: [{ type: 'text' as const, text: `Completed after ${delayMs}ms` }],
  };
}

export function register(server: McpServer): void {
  server.registerTool(name, { description, inputSchema }, handler);
}
