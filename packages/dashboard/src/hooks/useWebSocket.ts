import { useEffect, useRef, useCallback, useState } from 'react';
import type { ServerMessage, ClientMessage } from '@/types/events';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseWebSocketOptions {
  onMessage?: (message: ServerMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

interface UseWebSocketResult {
  status: ConnectionStatus;
  send: (message: ClientMessage) => void;
  subscribe: (sessionId: string) => void;
  unsubscribe: (sessionId: string) => void;
  requestBackfill: (sessionId: string, since?: number, limit?: number) => void;
  listSessions: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketResult {
  const { onMessage, onConnect, onDisconnect } = options;
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const subscriptionsRef = useRef<Set<string>>(new Set());

  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/events`;
  }, []);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribe = useCallback((sessionId: string) => {
    subscriptionsRef.current.add(sessionId);
    send({ type: 'subscribe', sessionId });
  }, [send]);

  const unsubscribe = useCallback((sessionId: string) => {
    subscriptionsRef.current.delete(sessionId);
    send({ type: 'unsubscribe', sessionId });
  }, [send]);

  const requestBackfill = useCallback((sessionId: string, since?: number, limit?: number) => {
    send({ type: 'backfill', sessionId, since, limit });
  }, [send]);

  const listSessions = useCallback(() => {
    send({ type: 'list_sessions' });
  }, [send]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setStatus('connecting');
    const ws = new WebSocket(getWebSocketUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectAttemptRef.current = 0;
      onConnect?.();

      // Resubscribe to all sessions
      for (const sessionId of subscriptionsRef.current) {
        send({ type: 'subscribe', sessionId });
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        onMessage?.(message);
      } catch {
        console.error('Failed to parse WebSocket message:', event.data);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
      onDisconnect?.();

      // Attempt reconnection with exponential backoff
      if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
        const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttemptRef.current);
        reconnectAttemptRef.current++;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
    };

    ws.onerror = () => {
      setStatus('error');
    };
  }, [getWebSocketUrl, onConnect, onDisconnect, onMessage, send]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    status,
    send,
    subscribe,
    unsubscribe,
    requestBackfill,
    listSessions,
  };
}
