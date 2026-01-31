import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Event, TaskCreatedEvent, TaskStatusEvent, RequestEvent, ResponseEvent, NotificationEvent } from '@/types/events';

// Mock useWebSocket
const mockSubscribe = vi.fn();
const mockUnsubscribe = vi.fn();
const mockRequestBackfill = vi.fn();
const mockListSessions = vi.fn();
let messageHandler: ((message: unknown) => void) | undefined;
let connectHandler: (() => void) | undefined;

vi.mock('./useWebSocket', () => ({
  useWebSocket: (options: { onMessage?: (m: unknown) => void; onConnect?: () => void }) => {
    messageHandler = options.onMessage;
    connectHandler = options.onConnect;
    return {
      status: 'connected',
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      requestBackfill: mockRequestBackfill,
      listSessions: mockListSessions,
    };
  },
}));

// Import after mocking
import { useEvents } from './useEvents';

describe('useEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    messageHandler = undefined;
    connectHandler = undefined;
  });

  it('subscribes to session on connect', async () => {
    renderHook(() => useEvents());

    // Simulate connect
    act(() => {
      connectHandler?.();
    });

    expect(mockListSessions).toHaveBeenCalled();
    expect(mockSubscribe).toHaveBeenCalledWith('*');
  });

  it('handles incoming events', async () => {
    const { result } = renderHook(() => useEvents());

    const event: RequestEvent = {
      type: 'request',
      timestamp: Date.now(),
      id: 1,
      method: 'tools/call',
      params: { name: 'test' },
    };

    act(() => {
      messageHandler?.({ type: 'event', sessionId: 'test', event });
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]).toEqual(event);
  });

  it('derives active tasks from task:created events', async () => {
    const { result } = renderHook(() => useEvents());

    const createdEvent: TaskCreatedEvent = {
      type: 'task:created',
      timestamp: Date.now(),
      taskId: 'task-1',
      toolName: 'test-tool',
      toolArgs: {},
      requestId: 1,
    };

    act(() => {
      messageHandler?.({ type: 'event', sessionId: 'test', event: createdEvent });
    });

    expect(result.current.activeTasks).toHaveLength(1);
    expect(result.current.activeTasks[0].taskId).toBe('task-1');
    expect(result.current.activeTasks[0].toolName).toBe('test-tool');
    expect(result.current.activeTasks[0].status).toBe('working');
  });

  it('updates task status on task:status events', async () => {
    const { result } = renderHook(() => useEvents());

    const createdEvent: TaskCreatedEvent = {
      type: 'task:created',
      timestamp: Date.now(),
      taskId: 'task-1',
      toolName: 'test-tool',
      toolArgs: {},
      requestId: 1,
    };

    const statusEvent: TaskStatusEvent = {
      type: 'task:status',
      timestamp: Date.now() + 1000,
      taskId: 'task-1',
      previousStatus: 'working',
      newStatus: 'input_required',
      statusMessage: 'Processing...',
    };

    act(() => {
      messageHandler?.({ type: 'event', sessionId: 'test', event: createdEvent });
      messageHandler?.({ type: 'event', sessionId: 'test', event: statusEvent });
    });

    expect(result.current.activeTasks).toHaveLength(1);
    expect(result.current.activeTasks[0].status).toBe('input_required');
    expect(result.current.activeTasks[0].statusMessage).toBe('Processing...');
  });

  it('removes tasks with terminal status', async () => {
    const { result } = renderHook(() => useEvents());

    const createdEvent: TaskCreatedEvent = {
      type: 'task:created',
      timestamp: Date.now(),
      taskId: 'task-1',
      toolName: 'test-tool',
      toolArgs: {},
      requestId: 1,
    };

    const completedEvent: TaskStatusEvent = {
      type: 'task:status',
      timestamp: Date.now() + 1000,
      taskId: 'task-1',
      previousStatus: 'working',
      newStatus: 'completed',
    };

    act(() => {
      messageHandler?.({ type: 'event', sessionId: 'test', event: createdEvent });
    });

    expect(result.current.activeTasks).toHaveLength(1);

    act(() => {
      messageHandler?.({ type: 'event', sessionId: 'test', event: completedEvent });
    });

    expect(result.current.activeTasks).toHaveLength(0);
  });

  it('derives tool calls from request/response pairs', async () => {
    const { result } = renderHook(() => useEvents());

    const requestEvent: RequestEvent = {
      type: 'request',
      timestamp: 1000,
      id: 1,
      method: 'tools/call',
      params: { name: 'test-tool', arguments: { arg: 'value' } },
    };

    const responseEvent: ResponseEvent = {
      type: 'response',
      timestamp: 2000,
      id: 1,
      result: { content: [] },
    };

    act(() => {
      messageHandler?.({ type: 'event', sessionId: 'test', event: requestEvent });
      messageHandler?.({ type: 'event', sessionId: 'test', event: responseEvent });
    });

    expect(result.current.toolCalls).toHaveLength(1);
    expect(result.current.toolCalls[0].toolName).toBe('test-tool');
    expect(result.current.toolCalls[0].duration).toBe(1000);
    expect(result.current.toolCalls[0].success).toBe(true);
  });

  it('marks tool calls as error when response has error', async () => {
    const { result } = renderHook(() => useEvents());

    const requestEvent: RequestEvent = {
      type: 'request',
      timestamp: 1000,
      id: 1,
      method: 'tools/call',
      params: { name: 'test-tool', arguments: {} },
    };

    const responseEvent: ResponseEvent = {
      type: 'response',
      timestamp: 2000,
      id: 1,
      error: { code: -32000, message: 'Tool failed' },
    };

    act(() => {
      messageHandler?.({ type: 'event', sessionId: 'test', event: requestEvent });
      messageHandler?.({ type: 'event', sessionId: 'test', event: responseEvent });
    });

    expect(result.current.toolCalls).toHaveLength(1);
    expect(result.current.toolCalls[0].success).toBe(false);
    expect(result.current.toolCalls[0].error?.message).toBe('Tool failed');
  });

  it('handles session changes', async () => {
    const { result } = renderHook(() => useEvents());

    act(() => {
      result.current.setSelectedSession('session-1');
    });

    expect(result.current.selectedSession).toBe('session-1');
  });

  it('merges backfill events without duplicates', async () => {
    const { result } = renderHook(() => useEvents());

    const event1: RequestEvent = {
      type: 'request',
      timestamp: 1000,
      id: 1,
      method: 'test',
    };

    const event2: RequestEvent = {
      type: 'request',
      timestamp: 2000,
      id: 2,
      method: 'test2',
    };

    // Add first event via regular event
    act(() => {
      messageHandler?.({ type: 'event', sessionId: 'test', event: event1 });
    });

    // Backfill includes both (simulating reconnect)
    act(() => {
      messageHandler?.({
        type: 'backfill',
        sessionId: 'test',
        events: [event1, event2],
      });
    });

    // Should have 2 events, not 3 (no duplicate)
    expect(result.current.events).toHaveLength(2);
  });

  it('updates sessions list on session_created message', async () => {
    const { result } = renderHook(() => useEvents());

    act(() => {
      messageHandler?.({
        type: 'session_created',
        session: {
          sessionId: 'new-session',
          clientInfo: { name: 'Test Client', version: '1.0.0' },
        },
      });
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].sessionId).toBe('new-session');
  });

  it('removes session on session_closed message', async () => {
    const { result } = renderHook(() => useEvents());

    // Add session first
    act(() => {
      messageHandler?.({
        type: 'session_created',
        session: { sessionId: 'session-1' },
      });
    });

    expect(result.current.sessions).toHaveLength(1);

    // Close session
    act(() => {
      messageHandler?.({
        type: 'session_closed',
        sessionId: 'session-1',
      });
    });

    expect(result.current.sessions).toHaveLength(0);
  });

  it('removes tasks with cancelled status (British spelling)', async () => {
    const { result } = renderHook(() => useEvents());

    const createdEvent: TaskCreatedEvent = {
      type: 'task:created',
      timestamp: Date.now(),
      taskId: 'task-1',
      toolName: 'test-tool',
      toolArgs: {},
      requestId: 1,
    };

    const cancelledEvent: TaskStatusEvent = {
      type: 'task:status',
      timestamp: Date.now() + 1000,
      taskId: 'task-1',
      previousStatus: 'working',
      newStatus: 'cancelled',
    };

    act(() => {
      messageHandler?.({ type: 'event', sessionId: 'test', event: createdEvent });
    });

    expect(result.current.activeTasks).toHaveLength(1);

    act(() => {
      messageHandler?.({ type: 'event', sessionId: 'test', event: cancelledEvent });
    });

    expect(result.current.activeTasks).toHaveLength(0);
  });

  it('attaches progress to task when progressToken matches taskId', async () => {
    // MCP SDK uses taskId as progressToken for task-based progress notifications
    const { result } = renderHook(() => useEvents());

    const createdEvent: TaskCreatedEvent = {
      type: 'task:created',
      timestamp: 1000,
      taskId: 'task-123',
      toolName: 'test-tool',
      toolArgs: {},
      requestId: 1,
    };

    const progressEvent: NotificationEvent = {
      type: 'notification',
      timestamp: 2000,
      method: 'notifications/progress',
      params: {
        progressToken: 'task-123',
        progress: 50,
        total: 100,
        message: 'Half done',
      },
    };

    act(() => {
      messageHandler?.({ type: 'event', sessionId: 'test', event: createdEvent });
      messageHandler?.({ type: 'event', sessionId: 'test', event: progressEvent });
    });

    expect(result.current.activeTasks).toHaveLength(1);
    expect(result.current.activeTasks[0].taskId).toBe('task-123');
    expect(result.current.activeTasks[0].progress).toBeDefined();
    expect(result.current.activeTasks[0].progress?.current).toBe(50);
    expect(result.current.activeTasks[0].progress?.total).toBe(100);
    expect(result.current.activeTasks[0].progress?.message).toBe('Half done');
  });
});
