import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';
import type { TaskStore } from '@modelcontextprotocol/sdk/experimental/tasks';

/**
 * Information about a connected client session.
 */
export interface SessionInfo {
  sessionId: string;
  clientInfo: { name: string; version: string };
  capabilities: ClientCapabilities;
  createdAt: Date;
  transport: StreamableHTTPServerTransport;
  server: McpServer;
}

/**
 * Summary of session info (without internal server/transport references).
 * Safe to expose via API.
 */
export interface SessionSummary {
  clientInfo: { name: string; version: string };
  capabilities: ClientCapabilities;
  createdAt: Date;
}

/**
 * Factory function for creating TaskStore instances.
 * Called with sessionId to allow per-session customization (e.g., observability wrappers).
 */
export type TaskStoreFactory = (sessionId: string) => TaskStore;

/**
 * Function to wrap a transport for observability or other purposes.
 */
export type TransportWrapper = (
  transport: StreamableHTTPServerTransport,
  sessionId: string
) => StreamableHTTPServerTransport;

/**
 * Options for SessionManager construction.
 */
export interface SessionManagerOptions {
  /**
   * Factory for creating TaskStore instances.
   * Each session gets its own TaskStore.
   */
  createTaskStore: TaskStoreFactory;

  /**
   * Optional function to wrap the transport (e.g., for observability).
   */
  wrapTransport?: TransportWrapper;
}
