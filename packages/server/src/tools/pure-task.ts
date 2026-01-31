import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolTaskHandler } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { CallToolResult, GetTaskResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const name = 'pure_task';

export const description = 'Test the task state machine in isolation, without progress notifications.';

export const inputSchema = {
  durationMs: z.number().min(1000).max(60000).describe('Duration in milliseconds (1000-60000)'),
};

export const handler: ToolTaskHandler<typeof inputSchema> = {
  createTask: async (args, extra) => {
    const { durationMs } = args;
    const task = await extra.taskStore.createTask({ ttl: extra.taskRequestedTtl ?? 60000 });

    // Start background work
    setTimeout(async () => {
      // Store the result (this also updates status)
      await extra.taskStore.storeTaskResult(task.taskId, 'completed', {
        content: [{ type: 'text' as const, text: `Task completed after ${durationMs}ms` }],
      });
    }, durationMs);

    // Return original task object (SDK pattern - don't re-fetch)
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
