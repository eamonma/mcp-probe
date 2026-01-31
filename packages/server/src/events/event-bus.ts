import { EventEmitter } from 'events';
import type { Event, EventInput } from './types.js';

/**
 * Options for EventBus construction.
 */
export interface EventBusOptions {
  /**
   * Maximum number of events to retain in the ring buffer.
   * Older events are evicted when this limit is reached.
   * Default: 1000
   */
  maxEvents?: number;
}

/**
 * Filter options for getEvents.
 */
export interface GetEventsOptions {
  /**
   * Only return events with timestamp >= since.
   */
  since?: number;
  /**
   * Maximum number of events to return (most recent).
   */
  limit?: number;
}

/**
 * Serializable snapshot of EventBus state.
 */
export interface EventBusSnapshot {
  sessionId: string;
  events: Event[];
  eventCount: number;
}

/**
 * Per-session event storage with ring buffer and pub/sub.
 *
 * Events are stored in a bounded ring buffer (FIFO eviction).
 * Subscribers are notified synchronously when events are emitted.
 */
export class EventBus extends EventEmitter {
  public readonly sessionId: string;
  private readonly maxEvents: number;
  private events: Event[] = [];

  constructor(sessionId: string, options: EventBusOptions = {}) {
    super();
    this.sessionId = sessionId;
    this.maxEvents = options.maxEvents ?? 1000;
  }

  /**
   * Emit an event to the bus.
   * Adds timestamp and notifies subscribers.
   */
  emit(event: string | symbol | EventInput): boolean {
    // Handle EventEmitter's emit signature
    if (typeof event === 'string' || typeof event === 'symbol') {
      // This is a standard EventEmitter emit call, delegate to super
      return super.emit(event, ...Array.from(arguments).slice(1));
    }

    // This is our custom event object
    const fullEvent: Event = {
      ...event,
      timestamp: Date.now(),
    } as Event;

    // Add to ring buffer
    this.events.push(fullEvent);

    // Evict oldest if over limit
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Notify subscribers
    super.emit('event', fullEvent);

    return true;
  }

  /**
   * Get events from the buffer.
   */
  getEvents(options: GetEventsOptions = {}): Event[] {
    let result = this.events;

    // Filter by timestamp
    if (options.since !== undefined) {
      result = result.filter((e) => e.timestamp >= options.since!);
    }

    // Apply limit (take most recent)
    if (options.limit !== undefined && result.length > options.limit) {
      result = result.slice(-options.limit);
    }

    return result;
  }

  /**
   * Clear all events from the buffer.
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get the current number of events in the buffer.
   */
  get eventCount(): number {
    return this.events.length;
  }

  /**
   * Get a JSON-serializable snapshot of the bus state.
   */
  toJSON(): EventBusSnapshot {
    return {
      sessionId: this.sessionId,
      events: [...this.events],
      eventCount: this.events.length,
    };
  }
}
