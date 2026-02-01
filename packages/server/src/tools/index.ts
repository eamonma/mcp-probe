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
import * as getLocation from './get-location.js';
import * as getWeather from './get-weather.js';

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
  getLocation,
  getWeather,
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
  getLocation.name,
  getWeather.name,
] as const;

// All tools as an array for filtering
const allTools = [
  simpleTool,
  syncWithProgress,
  pureTask,
  taskWithProgress,
  cancellableTask,
  multiStageTask,
  failingTask,
  pausableTask,
  getLocation,
  getWeather,
];

/**
 * Register MCP Probe tools with the given server.
 * Optionally filter to only register a subset of tools.
 *
 * @param server - The MCP server to register tools with
 * @param filter - Optional array of tool names to include. If not provided, all tools are registered.
 */
export function registerAllTools(server: McpServer, filter?: string[]): void {
  for (const tool of allTools) {
    if (!filter || filter.includes(tool.name)) {
      tool.register(server);
    }
  }
}
