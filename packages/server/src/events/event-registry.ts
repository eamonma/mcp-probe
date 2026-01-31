import { EventEmitter } from 'events';
import { EventBus } from './event-bus.js';
import type { Event } from './types.js';

/**
 * Options for EventRegistry construction.
 */
export interface EventRegistryOptions {
  /**
   * Maximum events per session bus.
   * Default: 1000
   */
  maxEventsPerSession?: number;
}

/**
 * Session metadata for observability.
 */
export interface SessionMetadata {
  clientInfo?: { name: string; version: string };
  createdAt?: Date;
}

/**
 * Summary information about a session's event bus.
 */
export interface SessionEventSummary {
  sessionId: string;
  eventCount: number;
  clientInfo?: { name: string; version: string };
  createdAt?: Date;
}

/**
 * Manages EventBus instances across all sessions.
 *
 * Provides:
 * - Per-session bus creation and retrieval
 * - Event forwarding with session context
 * - Session lifecycle management
 */
export class EventRegistry extends EventEmitter {
  private buses = new Map<string, EventBus>();
  private metadata = new Map<string, SessionMetadata>();
  private options: EventRegistryOptions;

  constructor(options: EventRegistryOptions = {}) {
    super();
    this.options = options;
  }

  /**
   * Get or create an EventBus for a session.
   */
  getOrCreateBus(sessionId: string): EventBus {
    let bus = this.buses.get(sessionId);

    if (!bus) {
      bus = new EventBus(sessionId, {
        maxEvents: this.options.maxEventsPerSession,
      });

      // Forward events with session context
      bus.on('event', (event: Event) => {
        this.emit('event', sessionId, event);
      });

      this.buses.set(sessionId, bus);
    }

    return bus;
  }

  /**
   * Get an existing EventBus (does not create).
   */
  getBus(sessionId: string): EventBus | undefined {
    return this.buses.get(sessionId);
  }

  /**
   * Set metadata for a session (clientInfo, createdAt).
   * Emits 'session:created' event when new metadata is set.
   */
  setSessionMetadata(sessionId: string, metadata: SessionMetadata): void {
    if (!this.buses.has(sessionId)) {
      return;
    }
    const isNew = !this.metadata.has(sessionId);
    this.metadata.set(sessionId, metadata);

    if (isNew) {
      this.emit('session:created', sessionId, metadata);
    }
  }

  /**
   * Close a session, removing its bus.
   * Returns the events for archiving, or undefined if session didn't exist.
   */
  closeSession(sessionId: string): Event[] | undefined {
    const bus = this.buses.get(sessionId);

    if (!bus) {
      return undefined;
    }

    const events = bus.getEvents();
    this.buses.delete(sessionId);
    this.metadata.delete(sessionId);
    this.emit('session:closed', sessionId);

    return events;
  }

  /**
   * Get all active session IDs.
   */
  getAllSessions(): string[] {
    return Array.from(this.buses.keys());
  }

  /**
   * Get summaries for all sessions.
   */
  getSessionSummaries(): SessionEventSummary[] {
    return Array.from(this.buses.entries()).map(([sessionId, bus]) => {
      const meta = this.metadata.get(sessionId);
      return {
        sessionId,
        eventCount: bus.eventCount,
        clientInfo: meta?.clientInfo,
        createdAt: meta?.createdAt,
      };
    });
  }
}
