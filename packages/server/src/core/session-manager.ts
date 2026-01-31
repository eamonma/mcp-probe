import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { InMemoryTaskMessageQueue } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { ClientCapabilities } from '@modelcontextprotocol/sdk/types.js';
import { registerAllTools } from '../tools/index.js';
import type { SessionInfo, SessionSummary, SessionManagerOptions } from './types.js';

/**
 * Manages MCP client sessions.
 *
 * Each session has its own McpServer, transport, and task store.
 * The TaskStore is created via a factory function, allowing injection
 * of custom implementations (e.g., for observability).
 */
export class SessionManager {
  private sessions = new Map<string, SessionInfo>();
  private options: SessionManagerOptions;

  constructor(options: SessionManagerOptions) {
    this.options = options;
  }

  /**
   * Creates a new session for a connecting client.
   */
  createSession(
    clientInfo: { name: string; version: string },
    capabilities: ClientCapabilities
  ): SessionInfo {
    const sessionId = randomUUID();
    const { server, transport } = this.createMcpServerWithTransport(sessionId);

    const sessionInfo: SessionInfo = {
      sessionId,
      clientInfo,
      capabilities,
      createdAt: new Date(),
      transport,
      server,
    };

    this.sessions.set(sessionId, sessionInfo);
    console.log(`[MCP Probe] Session created: ${sessionId} for client ${clientInfo.name}`);
    return sessionInfo;
  }

  /**
   * Retrieves a session by ID.
   */
  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Deletes a session, closing its transport.
   */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.transport.close();
      this.sessions.delete(sessionId);
      console.log(`[MCP Probe] Session closed: ${sessionId}`);
      return true;
    }
    return false;
  }

  /**
   * Returns all sessions as a summary (without internal references).
   */
  getAllSessions(): Record<string, SessionSummary> {
    const result: Record<string, SessionSummary> = {};
    for (const [sessionId, info] of this.sessions) {
      result[sessionId] = {
        clientInfo: info.clientInfo,
        capabilities: info.capabilities,
        createdAt: info.createdAt,
      };
    }
    return result;
  }

  /**
   * Updates the capabilities for an existing session.
   */
  updateSessionCapabilities(sessionId: string, capabilities: ClientCapabilities): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.capabilities = capabilities;
    }
  }

  /**
   * Creates an MCP server with transport for a session.
   * Uses the injected TaskStore factory.
   */
  private createMcpServerWithTransport(sessionId: string): {
    server: McpServer;
    transport: StreamableHTTPServerTransport;
  } {
    const taskStore = this.options.createTaskStore(sessionId);
    const taskMessageQueue = new InMemoryTaskMessageQueue();

    const server = new McpServer(
      {
        name: 'mcp-probe',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: { listChanged: true },
          tasks: {
            list: {},
            cancel: {},
            requests: { tools: { call: {} } },
          },
        },
        taskStore,
        taskMessageQueue,
      }
    );

    // Register all tools from modular tool definitions
    registerAllTools(server);

    // Create transport for this session
    let transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
    });

    // Wrap transport if wrapper provided
    if (this.options.wrapTransport) {
      transport = this.options.wrapTransport(transport, sessionId);
    }

    // Connect server to transport
    server.connect(transport);

    return { server, transport };
  }
}
