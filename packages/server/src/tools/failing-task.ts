import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolTaskHandler } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { CallToolResult, GetTaskResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const name = 'failing_task';

export const description = 'Test task failed state handling.';

const errorMessages: Record<string, string> = {
  timeout: 'Simulated timeout error: operation exceeded time limit',
  internal: 'Simulated internal error: unexpected server condition',
  validation: 'Simulated validation error: invalid data encountered',
};

export const inputSchema = {
  failAfterMs: z.number().min(1000).max(30000).describe('Time before failure in milliseconds (1000-30000)'),
  errorCode: z.enum(['timeout', 'internal', 'validation']).describe('Type of error to simulate'),
};

export const handler: ToolTaskHandler<typeof inputSchema> = {
  createTask: async (args, extra) => {
    const { failAfterMs, errorCode } = args;
    const task = await extra.taskStore.createTask({ ttl: extra.taskRequestedTtl ?? 60000 });
    const taskStore = extra.taskStore;
    const taskId = task.taskId;

    // Run asynchronously and fail after the specified time
    (async () => {
      await new Promise((resolve) => setTimeout(resolve, failAfterMs));

      // Set statusMessage while still in working state (per MCP spec: failed tasks SHOULD include statusMessage with diagnostic info)
      // storeTaskResult will then set the status to 'failed' while preserving the statusMessage
      await taskStore.updateTaskStatus(taskId, 'working', errorMessages[errorCode]);

      // Store failed result - this transitions to 'failed' status
      await taskStore.storeTaskResult(taskId, 'failed', {
        content: [{ type: 'text' as const, text: JSON.stringify({ error: errorCode, message: errorMessages[errorCode] }) }],
        isError: true,
      });
    })();

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
