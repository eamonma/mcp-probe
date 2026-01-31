import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolTaskHandler } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { CallToolResult, GetTaskResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

export const name = 'multi_stage_task';

export const description = 'Test progress message field changes across stages.';

const stageNames = [
  'Initializing',
  'Processing',
  'Finalizing',
  'Validating',
  'Optimizing',
  'Compiling',
  'Linking',
  'Packaging',
  'Deploying',
  'Completing',
];

export const inputSchema = {
  stageCount: z.number().min(2).max(10).describe('Number of stages (2-10)'),
  msPerStage: z.number().min(500).max(10000).describe('Milliseconds per stage (500-10000)'),
};

export const handler: ToolTaskHandler<typeof inputSchema> = {
  createTask: async (args, extra) => {
    const { stageCount, msPerStage } = args;
    const task = await extra.taskStore.createTask({ ttl: extra.taskRequestedTtl ?? 60000 });
    const progressToken = extra._meta?.progressToken;

    const completedStages: string[] = [];

    // Process stages synchronously (to keep SSE stream open for progress)
    for (let i = 1; i <= stageCount; i++) {
      await new Promise((resolve) => setTimeout(resolve, msPerStage));

      const stageName = stageNames[i - 1];
      completedStages.push(stageName);

      if (progressToken !== undefined) {
        await extra.sendNotification({
          method: 'notifications/progress' as const,
          params: {
            progressToken,
            progress: i,
            total: stageCount,
            message: `Stage ${i}: ${stageName}`,
          },
        });
      }
    }

    // Store the result
    await extra.taskStore.storeTaskResult(task.taskId, 'completed', {
      content: [{ type: 'text' as const, text: JSON.stringify({ stagesCompleted: completedStages }) }],
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
