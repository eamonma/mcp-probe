import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolTaskHandler } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { CallToolResult, GetTaskResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const name = 'pausable_task';

export const description = 'Test input_required state for human-in-the-loop workflows.';

// Metadata key for relating elicitation to task (per MCP spec)
const RELATED_TASK_META_KEY = 'io.modelcontextprotocol/related-task';

export const inputSchema = {
  itemCount: z.number().min(1).max(50).describe('Total number of items to process (1-50)'),
  pauseAfterItem: z.number().min(1).max(49).describe('Item number after which to pause (1-49)'),
};

// Factory function to create handler with server reference for elicitation
export function createHandler(server: McpServer): ToolTaskHandler<typeof inputSchema> {
  return {
    createTask: async (args, extra) => {
      const { itemCount, pauseAfterItem } = args;
      const task = await extra.taskStore.createTask({ ttl: extra.taskRequestedTtl ?? 60000 });
      const taskStore = extra.taskStore;
      const taskId = task.taskId;

      // Validate pauseAfterItem < itemCount
      if (pauseAfterItem >= itemCount) {
        await taskStore.storeTaskResult(taskId, 'failed', {
          content: [{ type: 'text' as const, text: 'pauseAfterItem must be less than itemCount' }],
          isError: true,
        });
        return { task };
      }

      // Run asynchronously
      (async () => {
        // Process items up to pause point
        for (let i = 1; i <= pauseAfterItem; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms per item
        }

        // Transition to input_required state and request user input via elicitation
        await taskStore.updateTaskStatus(taskId, 'input_required', 'Waiting for user confirmation to continue');

        let userConfirmed = false;
        try {
          // Request user input via elicitation (form mode)
          const elicitResult = await server.server.elicitInput({
            message: `Task paused after processing ${pauseAfterItem} of ${itemCount} items. Continue processing the remaining ${itemCount - pauseAfterItem} items?`,
            requestedSchema: {
              type: 'object' as const,
              properties: {
                continue: {
                  type: 'boolean' as const,
                  title: 'Continue processing?',
                  default: true,
                },
              },
              required: ['continue'],
            },
            _meta: {
              [RELATED_TASK_META_KEY]: { taskId },
            },
          });

          userConfirmed = elicitResult.action === 'accept' && elicitResult.content?.continue === true;
        } catch {
          // Client may not support elicitation - task stays in input_required state
          // This is expected for clients without elicitation capability
          return; // Task remains in input_required state
        }

        if (!userConfirmed) {
          // User declined to continue
          await taskStore.storeTaskResult(taskId, 'completed', {
            content: [{ type: 'text' as const, text: JSON.stringify({ itemsProcessed: pauseAfterItem, pausedAt: pauseAfterItem, userCancelled: true }) }],
          });
          return;
        }

        // Update back to working status
        await taskStore.updateTaskStatus(taskId, 'working', 'Resuming after user confirmation');

        // Process remaining items after resume
        const remaining = itemCount - pauseAfterItem;
        for (let i = 1; i <= remaining; i++) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Complete the task
        await taskStore.storeTaskResult(taskId, 'completed', {
          content: [{ type: 'text' as const, text: JSON.stringify({ itemsProcessed: itemCount, pausedAt: pauseAfterItem }) }],
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
}

export function register(server: McpServer): void {
  server.experimental.tasks.registerToolTask(
    name,
    {
      description,
      inputSchema,
      execution: { taskSupport: 'required' },
    },
    createHandler(server)
  );
}
