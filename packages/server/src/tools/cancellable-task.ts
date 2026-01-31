import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolTaskHandler } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { CallToolResult, GetTaskResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const name = 'cancellable_task';

export const description = 'Test tasks/cancel support.';

export const inputSchema = {
  durationMs: z.number().min(10000).max(120000).describe('Duration in milliseconds (10000-120000)'),
};

export const handler: ToolTaskHandler<typeof inputSchema> = {
  createTask: async (args, extra) => {
    const { durationMs } = args;
    const task = await extra.taskStore.createTask({ ttl: extra.taskRequestedTtl ?? 60000 });
    const taskStore = extra.taskStore;
    const taskId = task.taskId;
    const progressToken = extra._meta?.progressToken;

    // Run synchronously to keep SSE stream open for progress notifications
    const startTime = Date.now();
    const checkInterval = 100; // Check every 100ms
    const progressInterval = 1000; // Emit progress every second
    let lastProgressTime = startTime;
    let secondsElapsed = 0;
    const totalSeconds = Math.ceil(durationMs / 1000);

    while (Date.now() - startTime < durationMs) {
      // Check if task was cancelled
      const currentTask = await taskStore.getTask(taskId);
      if (!currentTask || currentTask.status === 'cancelled') {
        // Task was cancelled externally, stop work
        return { task };
      }

      // Emit progress every second
      const now = Date.now();
      if (now - lastProgressTime >= progressInterval) {
        secondsElapsed++;
        lastProgressTime = now;

        if (progressToken !== undefined) {
          await extra.sendNotification({
            method: 'notifications/progress' as const,
            params: {
              progressToken,
              progress: secondsElapsed,
              total: totalSeconds,
              message: `Running... ${secondsElapsed}s / ${totalSeconds}s`,
            },
          });
        }
      }

      await new Promise((resolve) => setTimeout(resolve, checkInterval));
    }

    // Check one more time before completing
    const finalTask = await taskStore.getTask(taskId);
    if (finalTask && finalTask.status !== 'cancelled') {
      await taskStore.storeTaskResult(taskId, 'completed', {
        content: [{ type: 'text' as const, text: `Task completed after ${durationMs}ms` }],
      });
    }

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
