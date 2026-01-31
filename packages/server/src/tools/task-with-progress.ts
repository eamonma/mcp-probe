import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolTaskHandler } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { CallToolResult, GetTaskResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const name = 'task_with_progress';

export const description = 'Test the combination of tasks and progress notifications.';

export const inputSchema = {
  itemCount: z.number().min(1).max(100).describe('Number of items to process (1-100)'),
  delayPerItemMs: z.number().min(10).max(1000).describe('Delay per item in milliseconds (10-1000)'),
};

export const handler: ToolTaskHandler<typeof inputSchema> = {
  createTask: async (args, extra) => {
    const { itemCount, delayPerItemMs } = args;
    const task = await extra.taskStore.createTask({ ttl: extra.taskRequestedTtl ?? 60000 });
    const progressToken = extra._meta?.progressToken;

    // Process items synchronously with progress notifications
    // (must be sync to keep SSE stream open for notifications)
    for (let i = 1; i <= itemCount; i++) {
      await new Promise((resolve) => setTimeout(resolve, delayPerItemMs));

      // Send progress notification if client requested it
      if (progressToken !== undefined) {
        await extra.sendNotification({
          method: 'notifications/progress' as const,
          params: {
            progressToken,
            progress: i,
            total: itemCount,
            message: `Processing item ${i} of ${itemCount}`,
          },
        });
      }
    }

    // Store the result
    await extra.taskStore.storeTaskResult(task.taskId, 'completed', {
      content: [{ type: 'text' as const, text: JSON.stringify({ processedItems: itemCount }) }],
    });

    // Return original task object (SDK pattern - task state will be polled separately)
    return { task };
  },
  getTask: async (_args, extra): Promise<GetTaskResult> => {
    const task = await extra.taskStore.getTask(extra.taskId);
    return task;
  },
  getTaskResult: async (_args, extra): Promise<CallToolResult> => {
    const result = await extra.taskStore.getTaskResult(extra.taskId);
    return result as CallToolResult;
  },
};

export function register(server: McpServer): void {
  server.experimental.tasks.registerToolTask(
    name,
    {
      description,
      inputSchema,
      execution: { taskSupport: 'required' },
    },
    handler
  );
}
