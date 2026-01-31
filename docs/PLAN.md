# Observability System Implementation Plan

## Overview

Add full protocol observability to MCP Probe, enabling a dashboard to see all MCP traffic in real-time. The implementation follows a decoupled architecture where the core MCP server logic remains unchanged and observability is injected via composition.

## Architecture

### Module Structure

```
packages/server/src/
├── core/                         # Pure MCP server logic (no observability deps)
│   ├── session-manager.ts        # Session lifecycle management
│   ├── mcp-factory.ts            # Creates McpServer + transport
│   └── types.ts                  # Core types (SessionInfo, factories)
│
├── tools/                        # Tool implementations (unchanged)
│
├── events/                       # Event infrastructure
│   ├── types.ts                  # Event type definitions
│   ├── event-bus.ts              # Per-session ring buffer + EventEmitter
│   ├── event-registry.ts         # Manages all session EventBuses
│   ├── observable-task-store.ts  # TaskStore wrapper that emits events
│   └── disk-store.ts             # Archive closed sessions to disk
│
├── observability/                # HTTP-level instrumentation
│   └── middleware.ts             # Express middleware for req/res capture
│
├── realtime/                     # Real-time delivery
│   └── websocket-hub.ts          # WebSocket server for dashboard
│
├── app.ts                        # Composition root (wires everything)
└── index.ts                      # Entry point
```

### Dependency Rules

1. `core/` and `tools/` must NOT import from `events/`, `observability/`, or `realtime/`
2. `observability/` and `realtime/` depend on `events/`
3. `app.ts` is the only place that wires observability into core

### Injection Pattern

SessionManager accepts a `TaskStoreFactory` function, allowing app.ts to inject either:
- Plain `InMemoryTaskStore` (observability disabled)
- `ObservableTaskStore` wrapper (observability enabled)

```typescript
// core/types.ts
type TaskStoreFactory = (sessionId: string) => TaskStore;

// app.ts
const sessionManager = new SessionManager({
  createTaskStore: (sessionId) => {
    const inner = new InMemoryTaskStore();
    return observabilityEnabled
      ? new ObservableTaskStore(inner, eventRegistry.getBus(sessionId))
      : inner;
  },
});
```

---

## Implementation Tasks

### Phase 1: Core Refactoring

**Goal**: Extract and reorganize existing code without changing behavior.

#### Task 1.1: Extract SessionManager to core/session-manager.ts
- Move `SessionManager` class from app.ts
- Move `SessionInfo` interface to core/types.ts
- Add `TaskStoreFactory` type to core/types.ts
- Modify constructor to accept `SessionManagerOptions` with factory

#### Task 1.2: Extract MCP factory to core/mcp-factory.ts
- Move `createMcpServerWithTransport()` function
- Accept `taskStore` as parameter instead of creating internally
- Keep tool registration via `registerAllTools()`

#### Task 1.3: Update app.ts as composition root
- Import from core/
- Wire SessionManager with default InMemoryTaskStore factory
- Verify all existing tests pass

### Phase 2: Event Infrastructure

**Goal**: Build the event capture and storage system.

#### Task 2.1: Define event types (events/types.ts)
```typescript
type EventType =
  | 'request'           // JSON-RPC request received
  | 'response'          // JSON-RPC response sent
  | 'notification'      // Notification sent (progress, task status, etc.)
  | 'task:created'      // Task was created
  | 'task:status'       // Task status changed
  | 'elicitation:sent'  // Elicitation request sent to client
  | 'elicitation:response'; // Elicitation response received

interface BaseEvent {
  type: EventType;
  timestamp: number;
}

interface RequestEvent extends BaseEvent {
  type: 'request';
  id: string | number;
  method: string;
  params?: unknown;
}

interface ResponseEvent extends BaseEvent {
  type: 'response';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface NotificationEvent extends BaseEvent {
  type: 'notification';
  method: string;
  params?: unknown;
}

interface TaskCreatedEvent extends BaseEvent {
  type: 'task:created';
  taskId: string;
  toolName: string;
  toolArgs: unknown;
  requestId: string | number;
}

interface TaskStatusEvent extends BaseEvent {
  type: 'task:status';
  taskId: string;
  previousStatus: string | null;
  newStatus: string;
  statusMessage?: string;
}

// ... elicitation events

type Event = RequestEvent | ResponseEvent | NotificationEvent | TaskCreatedEvent | TaskStatusEvent | ...;
```

#### Task 2.2: Implement EventBus (events/event-bus.ts)
- Ring buffer with configurable max size (default 1000)
- EventEmitter for real-time subscribers
- Methods: `emit(event)`, `getEvents(since?, limit?)`, `archiveToDisk(path)`
- Automatic timestamp injection

#### Task 2.3: Implement EventRegistry (events/event-registry.ts)
- Manages EventBus instances per session
- Re-emits events with sessionId for WebSocketHub
- Handles session close (archive + cleanup)
- Methods: `getOrCreateBus(sessionId)`, `closeSession(sessionId)`, `getAllBuses()`

#### Task 2.4: Implement ObservableTaskStore (events/observable-task-store.ts)
- Wraps any `TaskStore` implementation
- Emits events on: `createTask`, `updateTaskStatus`, `storeTaskResult`
- Captures original request context for `task:created` events

### Phase 3: HTTP Observability

**Goal**: Capture all wire traffic at the Express level.

#### Task 3.1: Implement observability middleware (observability/middleware.ts)
- Intercept incoming requests, emit `request` events
- Wrap `res.write()` to intercept SSE stream
- Parse SSE events, emit `notification` and `response` events
- Handle both JSON and SSE response formats
- Must handle sessionId extraction (from header or parsed from initialize request)

#### Task 3.2: Wire middleware into app.ts
- Add middleware before MCP routes when observability enabled
- Pass EventRegistry reference to middleware

### Phase 4: Real-time Delivery

**Goal**: Push events to dashboard via WebSocket.

#### Task 4.1: Implement WebSocketHub (realtime/websocket-hub.ts)
- WebSocket server on `/events` path
- Client protocol: subscribe, unsubscribe, backfill, list_sessions
- Server pushes: event, session_created, session_closed, backfill response
- Subscription management (per-session or wildcard)

#### Task 4.2: Wire WebSocketHub into app.ts
- Create HTTP server wrapper for Express app
- Attach WebSocketHub to HTTP server
- Subscribe hub to EventRegistry events

#### Task 4.3: Add session lifecycle events
- Emit `session:created` when SessionManager creates session
- Emit `session:closed` when session is deleted
- WebSocketHub broadcasts these to all connected dashboards

### Phase 5: Disk Persistence (Optional)

**Goal**: Archive closed sessions for later review.

#### Task 5.1: Implement disk store (events/disk-store.ts)
- Write events as JSONL (one JSON object per line)
- Filename format: `{sessionId}-{timestamp}.jsonl`
- Configurable archive directory

#### Task 5.2: Implement cleanup
- On server startup, delete archives older than N days
- Configurable retention period

#### Task 5.3: Add archive retrieval endpoint
- `GET /api/archives` - list archived sessions
- `GET /api/archives/:sessionId` - retrieve archived events

### Phase 6: Configuration & API

**Goal**: Clean public API and configuration.

#### Task 6.1: Define AppOptions interface
```typescript
interface AppOptions {
  observability?: {
    enabled: boolean;
    maxEventsPerSession?: number;    // default: 1000
    diskArchivePath?: string | null; // null = no disk persistence
    diskRetentionDays?: number;      // default: 7
  };
}
```

#### Task 6.2: Add REST endpoints for observability
- `GET /api/sessions` - list active sessions with event counts
- `GET /api/sessions/:id/events` - get events for session (with pagination)
- Useful for non-WebSocket clients or debugging

#### Task 6.3: Update index.ts
- Parse environment variables for configuration
- Example: `OBSERVABILITY_ENABLED=true`, `OBSERVABILITY_MAX_EVENTS=500`

---

## Testing Plan

### Unit Tests

| File | Tests |
|------|-------|
| `events/event-bus.test.ts` | Ring buffer overflow, emit/subscribe, getEvents filtering, archiveToDisk |
| `events/observable-task-store.test.ts` | Emits correct events for each TaskStore method |
| `core/session-manager.test.ts` | Session CRUD, factory injection, no observability coupling |

### Integration Tests

| File | Tests |
|------|-------|
| `observability/middleware.test.ts` | Captures requests, parses SSE, handles both response types |
| `realtime/websocket-hub.test.ts` | Subscribe/unsubscribe, broadcast, backfill |

### E2E Tests

| File | Tests |
|------|-------|
| `tests/observability.test.ts` | Full flow: MCP request → events captured → WebSocket receives |

---

## Migration Notes

- All existing tests must pass after Phase 1 (refactoring only)
- Observability is disabled by default (opt-in)
- No changes to tool implementations required
- Dashboard (packages/dashboard) is a separate future task

---

## Open Questions

1. **Should we expose raw SSE parsing or just the semantic events?**
   - Recommendation: Both. Raw for debugging, semantic for dashboard.

2. **How to handle very long-running tasks with many progress events?**
   - Recommendation: Ring buffer naturally handles this. Dashboard can request backfill if needed.

3. **Should elicitation correlation be automatic or manual?**
   - Recommendation: Automatic. Use `_meta["io.modelcontextprotocol/related-task"]` to link.

4. **WebSocket authentication?**
   - Recommendation: Skip for now. This is a development tool, not production infrastructure.
