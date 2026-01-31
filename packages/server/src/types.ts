import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolTaskHandler } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { CallToolResult, GetTaskResult } from '@modelcontextprotocol/sdk/types.js';
import type { z } from 'zod';

// Re-export commonly used types
export type { CallToolResult, GetTaskResult, ToolTaskHandler };

// Type for Zod input schema objects
export type ZodInputSchema = Record<string, z.ZodType>;

// Standard tool definition (non-task tools)
export interface StandardToolDefinition<TSchema extends ZodInputSchema> {
  name: string;
  description: string;
  inputSchema: TSchema;
  handler: (
    args: { [K in keyof TSchema]: z.infer<TSchema[K]> },
    extra: {
      _meta?: { progressToken?: string | number };
      sendNotification: (notification: { method: string; params: unknown }) => Promise<void>;
    }
  ) => Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

// Task tool definition
export interface TaskToolDefinition<TSchema extends ZodInputSchema> {
  name: string;
  description: string;
  inputSchema: TSchema;
  handler: ToolTaskHandler<TSchema>;
}

// Tool registration function type
export type ToolRegistrar = (server: McpServer) => void;
