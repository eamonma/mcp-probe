import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export const name = 'sync_with_progress';

export const description = 'Test progress notifications without task machinery.';

export const inputSchema = {
  itemCount: z.number().min(1).max(100).describe('Number of items to process (1-100)'),
  delayPerItemMs: z.number().min(10).max(1000).describe('Delay per item in milliseconds (10-1000)'),
  mode: z.enum(['determinate', 'indeterminate']).describe('Progress mode'),
};

type Args = {
  itemCount: number;
  delayPerItemMs: number;
  mode: 'determinate' | 'indeterminate';
};

type Extra = {
  _meta?: { progressToken?: string | number };
  sendNotification: (notification: { method: string; params: unknown }) => Promise<void>;
};

export async function handler({ itemCount, delayPerItemMs, mode }: Args, extra: Extra) {
  const progressToken = extra._meta?.progressToken;

  for (let i = 1; i <= itemCount; i++) {
    // Wait for the delay
    await new Promise((resolve) => setTimeout(resolve, delayPerItemMs));

    // Send progress notification if client requested it
    if (progressToken !== undefined) {
      const notification = {
        method: 'notifications/progress' as const,
        params: {
          progressToken,
          progress: i,
          ...(mode === 'determinate' ? { total: itemCount } : {}),
          message: mode === 'determinate'
            ? `Processing item ${i} of ${itemCount}`
            : `Processing item ${i}...`,
        },
      };
      await extra.sendNotification(notification);
    }
  }

  return {
    content: [{ type: 'text' as const, text: JSON.stringify({ processedItems: itemCount }) }],
  };
}

export function register(server: McpServer): void {
  server.registerTool(name, { description, inputSchema }, handler);
}
