import type { Request, Response, NextFunction, RequestHandler } from 'express';
import type { EventRegistry } from '../events/event-registry.js';

/**
 * Parses SSE data from a chunk of text.
 * Returns an array of parsed JSON objects from 'data:' lines.
 */
function parseSSEChunk(chunk: string): unknown[] {
  const results: unknown[] = [];
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const jsonStr = line.slice(6); // Remove 'data: ' prefix
        if (jsonStr.trim()) {
          results.push(JSON.parse(jsonStr));
        }
      } catch {
        // Ignore malformed JSON
      }
    }
  }

  return results;
}

/**
 * Determines if a JSON-RPC message is a notification (no id field).
 */
function isNotification(msg: unknown): boolean {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'method' in msg &&
    !('id' in msg)
  );
}

/**
 * Determines if a JSON-RPC message is a response (has id and result/error).
 */
function isResponse(msg: unknown): boolean {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'id' in msg &&
    ('result' in msg || 'error' in msg)
  );
}

/**
 * Creates Express middleware that captures MCP protocol traffic.
 *
 * Emits events to the EventRegistry:
 * - 'request' for incoming JSON-RPC requests
 * - 'response' for outgoing JSON-RPC responses
 * - 'notification' for outgoing notifications (in SSE streams)
 */
export function createObservabilityMiddleware(
  registry: EventRegistry
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    // Get or derive session ID
    let sessionId = req.headers['mcp-session-id'] as string | undefined;

    // Capture request if it looks like JSON-RPC
    const body = req.body;
    const isInitializeRequest = body?.method === 'initialize' && !sessionId;

    // For non-initialize requests with a session ID, emit immediately
    if (body && typeof body === 'object' && 'method' in body && !isInitializeRequest) {
      const effectiveSessionId = sessionId || 'unknown';
      const bus = registry.getOrCreateBus(effectiveSessionId);

      bus.emit({
        type: 'request',
        id: body.id,
        method: body.method,
        params: body.params,
      });
    }

    // For initialize requests, we'll emit in res.end() when we have the session ID
    let deferredRequestEvent: { id: string | number; method: string; params: unknown } | null = null;
    if (isInitializeRequest) {
      deferredRequestEvent = {
        id: body.id,
        method: body.method,
        params: body.params,
      };
    }

    // Intercept response writes to capture SSE events and JSON responses
    const originalWrite = res.write.bind(res);
    const originalEnd = res.end.bind(res);
    let responseBuffer = '';

    // Override write to capture SSE stream
    res.write = function (
      chunk: unknown,
      encodingOrCallback?: BufferEncoding | ((error: Error | null | undefined) => void),
      callback?: (error: Error | null | undefined) => void
    ): boolean {
      if (chunk) {
        const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString();
        responseBuffer += chunkStr;

        // Check if this looks like SSE
        const contentType = res.getHeader('Content-Type');
        if (contentType && String(contentType).includes('text/event-stream')) {
          const effectiveSessionId = sessionId || (res.getHeader('Mcp-Session-Id') as string) || 'unknown';
          const bus = registry.getOrCreateBus(effectiveSessionId);

          const messages = parseSSEChunk(chunkStr);
          for (const msg of messages) {
            if (isNotification(msg)) {
              const notif = msg as { method: string; params?: unknown };
              bus.emit({
                type: 'notification',
                method: notif.method,
                params: notif.params,
              });
            } else if (isResponse(msg)) {
              const resp = msg as { id: string | number; result?: unknown; error?: unknown };
              bus.emit({
                type: 'response',
                id: resp.id,
                result: resp.result,
                error: resp.error as { code: number; message: string } | undefined,
              });
            }
          }
        }
      }

      // Call original with proper overload handling
      if (typeof encodingOrCallback === 'function') {
        return originalWrite(chunk, encodingOrCallback);
      }
      if (encodingOrCallback !== undefined) {
        return originalWrite(chunk, encodingOrCallback, callback);
      }
      return originalWrite(chunk);
    } as typeof res.write;

    // Override end to capture final JSON response
    res.end = function (
      chunk?: unknown,
      encodingOrCallback?: BufferEncoding | (() => void),
      callback?: () => void
    ): Response {
      if (chunk) {
        const chunkStr = typeof chunk === 'string' ? chunk : chunk.toString();
        responseBuffer += chunkStr;
      }

      // Determine the effective session ID (may come from response header for initialize)
      const effectiveSessionId = sessionId || (res.getHeader('Mcp-Session-Id') as string) || 'unknown';
      const bus = registry.getOrCreateBus(effectiveSessionId);

      // Emit deferred initialize request event now that we have the session ID
      if (deferredRequestEvent) {
        bus.emit({
          type: 'request',
          id: deferredRequestEvent.id,
          method: deferredRequestEvent.method,
          params: deferredRequestEvent.params,
        });
        deferredRequestEvent = null;
      }

      // Try to parse as JSON response if not SSE
      const contentType = res.getHeader('Content-Type');
      if (!contentType || !String(contentType).includes('text/event-stream')) {
        try {
          const json = JSON.parse(responseBuffer);
          if (isResponse(json)) {
            bus.emit({
              type: 'response',
              id: json.id,
              result: json.result,
              error: json.error,
            });
          }
        } catch {
          // Not JSON or malformed, ignore
        }
      }

      // Call original with proper overload handling
      if (typeof encodingOrCallback === 'function') {
        return originalEnd(chunk, encodingOrCallback);
      }
      if (encodingOrCallback !== undefined) {
        return originalEnd(chunk, encodingOrCallback, callback);
      }
      return originalEnd(chunk);
    } as typeof res.end;

    next();
  };
}
