import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const name = 'get_weather';

export const description = 'Returns the current weather for a given location.';

export const inputSchema = {
  location: z.string().describe('The location to get weather for'),
};

export async function handler({ location }: { location: string }) {
  return {
    content: [
      {
        type: 'text' as const,
        text: `The current weather in ${location} is sunny with a temperature of 72°F (22°C).`,
      },
    ],
  };
}

export function register(server: McpServer): void {
  server.registerTool(name, { description, inputSchema }, handler);
}
