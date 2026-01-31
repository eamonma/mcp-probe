import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Import all tools
import * as simpleTool from './simple-tool.js';
import * as syncWithProgress from './sync-with-progress.js';
import * as pureTask from './pure-task.js';
import * as taskWithProgress from './task-with-progress.js';
import * as cancellableTask from './cancellable-task.js';
import * as multiStageTask from './multi-stage-task.js';
import * as failingTask from './failing-task.js';
import * as pausableTask from './pausable-task.js';

// Export individual tools for direct access
export {
  simpleTool,
  syncWithProgress,
  pureTask,
  taskWithProgress,
  cancellableTask,
  multiStageTask,
  failingTask,
  pausableTask,
};

// List of all tool names for reference
export const toolNames = [
  simpleTool.name,
  syncWithProgress.name,
  pureTask.name,
  taskWithProgress.name,
  cancellableTask.name,
  multiStageTask.name,
  failingTask.name,
  pausableTask.name,
] as const;

/**
 * Register all MCP Probe tools with the given server.
 * This is the main entry point for tool registration.
 */
export function registerAllTools(server: McpServer): void {
  simpleTool.register(server);
  syncWithProgress.register(server);
  pureTask.register(server);
  taskWithProgress.register(server);
  cancellableTask.register(server);
  multiStageTask.register(server);
  failingTask.register(server);
  pausableTask.register(server);
}
