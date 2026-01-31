import type { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { EventBus } from './event-bus.js';

/**
 * Checks if message is a notification (has method, no id).
 */
function isNotification(msg: JSONRPCMessage): boolean {
  return 'method' in msg && !('id' in msg);
}

/**
 * Checks if message is a response (has id and result/error).
 */
function isResponse(msg: JSONRPCMessage): boolean {
  return 'id' in msg && ('result' in msg || 'error' in msg);
}

/**
 * Wraps a StreamableHTTPServerTransport to emit events for outgoing messages.
 */
export function wrapTransportForObservability(
  transport: StreamableHTTPServerTransport,
  bus: EventBus
): StreamableHTTPServerTransport {
  const originalSend = transport.send.bind(transport);

  transport.send = async (message: JSONRPCMessage, options?: { relatedRequestId?: string | number }) => {
    if (isNotification(message)) {
      const notif = message as { method: string; params?: unknown };
      bus.emit({
        type: 'notification',
        method: notif.method,
        params: notif.params,
      });
    } else if (isResponse(message)) {
      const resp = message as { id: string | number; result?: unknown; error?: unknown };
      bus.emit({
        type: 'response',
        id: resp.id,
        result: resp.result,
        error: resp.error as { code: number; message: string } | undefined,
      });
    }

    return originalSend(message, options);
  };

  return transport;
}
