/**
 * Event types for observability.
 * Copied from packages/server/src/events/types.ts
 */

export type EventType =
  | 'request'
  | 'response'
  | 'notification'
  | 'task:created'
  | 'task:status';

/**
 * Base interface for all events.
 */
export interface BaseEvent {
  type: EventType;
  timestamp: number;
}

/**
 * JSON-RPC request received from client.
 */
export interface RequestEvent extends BaseEvent {
  type: 'request';
  id: string | number;
  method: string;
  params?: unknown;
}

/**
 * JSON-RPC response sent to client.
 */
export interface ResponseEvent extends BaseEvent {
  type: 'response';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Notification sent (progress, task status, elicitation, etc.).
 */
export interface NotificationEvent extends BaseEvent {
  type: 'notification';
  method: string;
  params?: unknown;
}

/**
 * Task was created.
 */
export interface TaskCreatedEvent extends BaseEvent {
  type: 'task:created';
  taskId: string;
  toolName: string;
  toolArgs: unknown;
  requestId: string | number;
}

/**
 * Task status changed.
 */
export interface TaskStatusEvent extends BaseEvent {
  type: 'task:status';
  taskId: string;
  previousStatus: string | null;
  newStatus: string;
  statusMessage?: string;
}

/**
 * Union of all event types.
 */
export type Event =
  | RequestEvent
  | ResponseEvent
  | NotificationEvent
  | TaskCreatedEvent
  | TaskStatusEvent;

/**
 * WebSocket message types from server.
 */
export type ServerMessage =
  | { type: 'event'; sessionId: string; event: Event }
  | { type: 'backfill'; sessionId: string; events: Event[] }
  | {
      type: 'sessions';
      sessions: Array<{
        sessionId: string;
        eventCount: number;
        clientInfo?: { name: string; version: string };
        createdAt?: string;
      }>;
    }
  | {
      type: 'session_created';
      session: {
        sessionId: string;
        clientInfo?: { name: string; version: string };
        createdAt?: string;
      };
    }
  | { type: 'session_closed'; sessionId: string }
  | { type: 'error'; message: string };

/**
 * WebSocket message types to server.
 */
export type ClientMessage =
  | { type: 'subscribe'; sessionId: string }
  | { type: 'unsubscribe'; sessionId: string }
  | { type: 'backfill'; sessionId: string; since?: number; limit?: number }
  | { type: 'list_sessions' };

/**
 * Session summary from REST API.
 */
export interface SessionSummary {
  sessionId: string;
  eventCount: number;
  clientInfo?: {
    name: string;
    version: string;
  };
  createdAt?: string;
}

/**
 * Active task derived from events.
 */
export interface ActiveTask {
  taskId: string;
  toolName: string;
  toolArgs: unknown;
  requestId: string | number;
  status: string;
  statusMessage?: string;
  createdAt: number;
  updatedAt: number;
  progress?: {
    current: number;
    total?: number;
    message?: string;
  };
}

/**
 * Tool call derived from request/response pairs.
 */
export interface ToolCall {
  id: string | number;
  toolName: string;
  params: unknown;
  requestedAt: number;
  respondedAt?: number;
  duration?: number;
  success?: boolean;
  error?: { code: number; message: string };
}
