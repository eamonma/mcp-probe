import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWebSocket } from './useWebSocket';
import type { Event, ServerMessage, ActiveTask, ToolCall, SessionSummary } from '@/types/events';

// Internal type that includes sessionId with the event
interface EventWithSession {
  event: Event;
  sessionId: string;
}

interface UseEventsResult {
  events: Event[];
  allEvents: Event[];
  allTasks: ActiveTask[];
  toolCalls: ToolCall[];
  sessions: SessionSummary[];
  connectionStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  selectedSession: string;
  setSelectedSession: (sessionId: string) => void;
  clearEvents: () => void;
}

export function useEvents(): UseEventsResult {
  const [eventsWithSession, setEventsWithSession] = useState<EventWithSession[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [selectedSession, setSelectedSession] = useState<string>('*');

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case 'event':
        setEventsWithSession((prev) => [{ event: message.event, sessionId: message.sessionId }, ...prev]);
        setSessions((prev) =>
          prev.map((session) =>
            session.sessionId === message.sessionId
              ? { ...session, eventCount: session.eventCount + 1 }
              : session
          )
        );
        break;

      case 'backfill':
        setEventsWithSession((prev) => {
          // Merge backfill events with existing, avoiding duplicates by timestamp
          const existingTimestamps = new Set(prev.map((e) => e.event.timestamp));
          const newEvents = message.events
            .filter((e) => !existingTimestamps.has(e.timestamp))
            .map((event) => ({ event, sessionId: message.sessionId }));
          return [...newEvents.reverse(), ...prev];
        });
        break;

      case 'sessions':
        setSessions(
          message.sessions.map((s) => ({
            sessionId: s.sessionId,
            eventCount: s.eventCount,
            clientInfo: s.clientInfo,
            createdAt: s.createdAt,
          }))
        );
        break;

      case 'session_created':
        setSessions((prev) => [
          ...prev,
          {
            sessionId: message.session.sessionId,
            eventCount: 0,
            clientInfo: message.session.clientInfo,
            createdAt: message.session.createdAt,
          },
        ]);
        break;

      case 'session_closed':
        setSessions((prev) => prev.filter((s) => s.sessionId !== message.sessionId));
        break;

      case 'error':
        console.error('WebSocket error:', message.message);
        break;
    }
  }, []);

  const handleConnect = useCallback(() => {
    // Request session list on connect
    listSessions();
  }, []);

  const { status, subscribe, unsubscribe, requestBackfill, listSessions } = useWebSocket({
    onMessage: handleMessage,
    onConnect: handleConnect,
  });

  // Subscribe to selected session
  useEffect(() => {
    if (status === 'connected') {
      // Don't clear events when switching sessions - preserve all events
      // and filter by selectedSession in the useMemo below

      // Subscribe to selected session
      subscribe(selectedSession);

      // Request backfill for history
      if (selectedSession !== '*') {
        requestBackfill(selectedSession, undefined, 100);
      }

      return () => {
        unsubscribe(selectedSession);
      };
    }
  }, [status, selectedSession, subscribe, unsubscribe, requestBackfill]);

  // clearEvents function to manually clear all events
  const clearEvents = useCallback(() => {
    setEventsWithSession([]);
  }, []);

  // All events (unfiltered) - just the Event objects without sessionId wrapper
  const allEvents = useMemo(() => {
    return eventsWithSession.map((e) => e.event);
  }, [eventsWithSession]);

  // Filtered events based on selectedSession
  const events = useMemo(() => {
    if (selectedSession === '*') {
      return eventsWithSession.map((e) => e.event);
    }
    return eventsWithSession
      .filter((e) => e.sessionId === selectedSession)
      .map((e) => e.event);
  }, [eventsWithSession, selectedSession]);

  // Derive all tasks from events (including terminal states)
  const allTasks = useMemo(() => {
    const tasksMap = new Map<string, ActiveTask>();
    const progressMap = new Map<string, { current: number; total?: number; message?: string }>();

    // Process events in chronological order (oldest first since events are newest-first)
    const chronological = [...events].reverse();

    for (const event of chronological) {
      if (event.type === 'task:created') {
        tasksMap.set(event.taskId, {
          taskId: event.taskId,
          toolName: event.toolName,
          toolArgs: event.toolArgs,
          requestId: event.requestId,
          status: 'working',
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        });
      } else if (event.type === 'task:status') {
        const existing = tasksMap.get(event.taskId);
        if (existing) {
          existing.status = event.newStatus;
          existing.statusMessage = event.statusMessage;
          existing.updatedAt = event.timestamp;
          existing.progress = progressMap.get(event.taskId);
          // Keep all tasks including terminal statuses
        }
      } else if (event.type === 'notification' && event.method === 'notifications/progress') {
        const params = event.params as { progressToken?: string; progress?: number; total?: number; message?: string } | undefined;
        if (params?.progressToken) {
          progressMap.set(params.progressToken, {
            current: params.progress ?? 0,
            total: params.total,
            message: params.message,
          });

          // Update task if it exists
          const task = tasksMap.get(params.progressToken);
          if (task) {
            task.progress = progressMap.get(params.progressToken);
            task.updatedAt = event.timestamp;
          }
        }
      }
    }

    return Array.from(tasksMap.values()).sort((a, b) => b.createdAt - a.createdAt);
  }, [events]);

  // Derive tool calls from request/response pairs
  const toolCalls = useMemo(() => {
    const requestsMap = new Map<string | number, { toolName: string; params: unknown; requestedAt: number }>();
    const calls: ToolCall[] = [];

    // Process in chronological order
    const chronological = [...events].reverse();

    for (const event of chronological) {
      if (event.type === 'request' && event.method === 'tools/call') {
        const params = event.params as { name?: string; arguments?: unknown } | undefined;
        if (params?.name) {
          requestsMap.set(event.id, {
            toolName: params.name,
            params: params.arguments,
            requestedAt: event.timestamp,
          });
        }
      } else if (event.type === 'response') {
        const request = requestsMap.get(event.id);
        if (request) {
          calls.push({
            id: event.id,
            toolName: request.toolName,
            params: request.params,
            requestedAt: request.requestedAt,
            respondedAt: event.timestamp,
            duration: event.timestamp - request.requestedAt,
            success: !event.error,
            error: event.error,
          });
          requestsMap.delete(event.id);
        }
      }
    }

    // Add pending requests (no response yet)
    for (const [id, request] of requestsMap) {
      calls.push({
        id,
        toolName: request.toolName,
        params: request.params,
        requestedAt: request.requestedAt,
      });
    }

    // Sort by most recent first, limit to 50
    return calls.sort((a, b) => b.requestedAt - a.requestedAt).slice(0, 50);
  }, [events]);

  return {
    events,
    allEvents,
    allTasks,
    toolCalls,
    sessions,
    connectionStatus: status,
    selectedSession,
    setSelectedSession,
    clearEvents,
  };
}
