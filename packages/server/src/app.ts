import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer, Server as HttpServer } from 'http';
import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks';
import { SessionManager } from './core/session-manager.js';
import { EventRegistry } from './events/event-registry.js';
import { ObservableTaskStore } from './events/observable-task-store.js';
import { wrapTransportForObservability } from './events/observable-transport.js';
import { createObservabilityMiddleware } from './observability/middleware.js';
import { WebSocketHub } from './realtime/websocket-hub.js';
import { setSpanAttributes, MCP_ATTRIBUTES } from './telemetry/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Options for configuring the MCP Probe server.
 */
export interface AppOptions {
  /**
   * Enable observability features (event capture, WebSocket hub).
   * Default: false
   */
  observability?: {
    enabled: boolean;
    /**
     * Maximum events to retain per session.
     * Default: 1000
     */
    maxEventsPerSession?: number;
  };
}

/**
 * Return type for createApp when observability is enabled.
 */
export interface AppWithObservability {
  app: express.Express;
  server: HttpServer;
  eventRegistry: EventRegistry;
  wsHub: WebSocketHub;
  sessionManager: SessionManager;
}

/**
 * Return type for createApp when observability is disabled.
 */
export interface AppWithoutObservability {
  app: express.Express;
  sessionManager: SessionManager;
}

export function createApp(options?: AppOptions): AppWithObservability | AppWithoutObservability {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Set up observability if enabled
  const observabilityEnabled = options?.observability?.enabled ?? false;
  let eventRegistry: EventRegistry | undefined;

  if (observabilityEnabled) {
    eventRegistry = new EventRegistry({
      maxEventsPerSession: options?.observability?.maxEventsPerSession,
    });

    // Add observability middleware to capture traffic
    app.use(createObservabilityMiddleware(eventRegistry));
  }

  // Session manager for multi-client support
  const sessionManager = new SessionManager({
    createTaskStore: (sessionId) => {
      const innerStore = new InMemoryTaskStore();

      if (eventRegistry) {
        // Wrap with observable store for event capture
        const bus = eventRegistry.getOrCreateBus(sessionId);
        return new ObservableTaskStore(innerStore, bus);
      }

      return innerStore;
    },
    wrapTransport: eventRegistry
      ? (transport, sessionId) => {
          const bus = eventRegistry.getOrCreateBus(sessionId);
          return wrapTransportForObservability(transport, bus);
        }
      : undefined,
  });

  // Debug endpoint to list all sessions and their capabilities
  app.get('/debug/sessions', (_req, res) => {
    const sessions = sessionManager.getAllSessions();
    res.json({
      sessions,
      sessionCount: Object.keys(sessions).length,
    });
  });

  // API endpoints for observability (when enabled)
  if (eventRegistry) {
    app.get('/api/events/sessions', (_req, res) => {
      res.json({
        sessions: eventRegistry!.getSessionSummaries(),
      });
    });

    app.get('/api/events/sessions/:sessionId', (req, res) => {
      const bus = eventRegistry!.getBus(req.params.sessionId);
      if (!bus) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      const since = req.query.since ? parseInt(req.query.since as string, 10) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

      res.json({
        sessionId: req.params.sessionId,
        events: bus.getEvents({ since, limit }),
        eventCount: bus.eventCount,
      });
    });
  }

  // Handle POST requests to /mcp
  app.post('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    const body = req.body;

    // Add OTEL span attributes for MCP messages
    if (body?.method) {
      setSpanAttributes({
        [MCP_ATTRIBUTES.MESSAGE_METHOD]: body.method,
        [MCP_ATTRIBUTES.MESSAGE_ID]: body.id ? String(body.id) : 'notification',
        [MCP_ATTRIBUTES.MESSAGE_TYPE]: body.id ? 'request' : 'notification',
      });
    }

    if (sessionId) {
      setSpanAttributes({
        [MCP_ATTRIBUTES.SESSION_ID]: sessionId,
      });
    }

    // Check if this is an initialize request
    const isInitialize = body?.method === 'initialize';

    if (isInitialize) {
      // Create a new session for the client
      const clientInfo = body.params?.clientInfo || { name: 'unknown', version: '0.0.0' };
      const capabilities = body.params?.capabilities || {};

      // Add client info to OTEL span
      setSpanAttributes({
        [MCP_ATTRIBUTES.CLIENT_NAME]: clientInfo.name,
        [MCP_ATTRIBUTES.CLIENT_VERSION]: clientInfo.version,
      });

      const session = sessionManager.createSession(clientInfo, capabilities);

      // Log client capabilities
      console.log(`[MCP Probe] Client ${clientInfo.name} connected with capabilities:`, JSON.stringify(capabilities, null, 2));
      if (!capabilities?.elicitation?.form) {
        console.log('[MCP Probe] WARNING: Client does not support form elicitation');
      }

      // Track session metadata for observability
      if (eventRegistry) {
        eventRegistry.setSessionMetadata(session.sessionId, {
          clientInfo,
          createdAt: session.createdAt,
        });
      }

      // Handle the request with the new session's transport
      await session.transport.handleRequest(req, res, body);
      return;
    }

    // For non-initialize requests, require a valid session ID
    if (!sessionId) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Missing Mcp-Session-Id header' },
        id: body?.id ?? null,
      });
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Session not found' },
        id: body?.id ?? null,
      });
      return;
    }

    // Route to the session's transport
    await session.transport.handleRequest(req, res, body);
  });

  // Handle GET requests to /mcp (SSE stream)
  app.get('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Missing Mcp-Session-Id header' },
        id: null,
      });
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Session not found' },
        id: null,
      });
      return;
    }

    await session.transport.handleRequest(req, res);
  });

  // Handle DELETE requests to /mcp (session termination)
  app.delete('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (!sessionId) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Missing Mcp-Session-Id header' },
        id: null,
      });
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Session not found' },
        id: null,
      });
      return;
    }

    // Let the transport handle the DELETE first
    await session.transport.handleRequest(req, res);

    // Clean up the session
    sessionManager.deleteSession(sessionId);

    // Clean up event registry if observability is enabled
    if (eventRegistry) {
      eventRegistry.closeSession(sessionId);
    }
  });

  // Serve dashboard static files when observability is enabled
  if (observabilityEnabled) {
    const dashboardPath = path.join(__dirname, '../../dashboard/dist');
    app.use('/dashboard', express.static(dashboardPath));

    // Serve index.html for SPA routing (Express 5 syntax)
    app.get('/dashboard/{*splat}', (_req, res) => {
      res.sendFile(path.join(dashboardPath, 'index.html'));
    });
  }

  // Return different shapes based on observability
  if (observabilityEnabled && eventRegistry) {
    const server = createServer(app);
    const wsHub = new WebSocketHub(server, eventRegistry);

    return {
      app,
      server,
      eventRegistry,
      wsHub,
      sessionManager,
    };
  }

  return {
    app,
    sessionManager,
  };
}
