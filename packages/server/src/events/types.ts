/**
 * Distributive Omit that works correctly with union types.
 * Standard Omit<Union, Key> only keeps common properties.
 * This version distributes over each member of the union.
 */
export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

/**
 * Event types for observability.
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
 * Event input type for emit() - event without timestamp.
 */
export type EventInput = DistributiveOmit<Event, 'timestamp'>;
