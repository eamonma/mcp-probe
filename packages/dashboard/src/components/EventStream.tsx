import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { Event, EventType } from '@/types/events';
import { cn } from '@/lib/utils';

interface EventStreamProps {
  events: Event[];
}

const eventTypeVariant: Record<EventType, 'request' | 'response' | 'notification' | 'task' | 'error'> = {
  request: 'request',
  response: 'response',
  notification: 'notification',
  'task:created': 'task',
  'task:status': 'task',
};

function getEventLabel(event: Event): string {
  switch (event.type) {
    case 'request':
      return event.method;
    case 'response':
      return event.error ? 'error' : 'result';
    case 'notification':
      return event.method;
    case 'task:created':
      return event.toolName;
    case 'task:status':
      return event.newStatus;
  }
}

function getEventDetails(event: Event): unknown {
  switch (event.type) {
    case 'request':
      return { id: event.id, method: event.method, params: event.params };
    case 'response':
      return { id: event.id, result: event.result, error: event.error };
    case 'notification':
      return { method: event.method, params: event.params };
    case 'task:created':
      return { taskId: event.taskId, toolName: event.toolName, toolArgs: event.toolArgs };
    case 'task:status':
      return { taskId: event.taskId, status: event.newStatus, message: event.statusMessage };
  }
}

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions);
}

function EventRow({ event }: { event: Event }) {
  const [isOpen, setIsOpen] = useState(false);
  const variant = event.type === 'response' && event.error ? 'error' : eventTypeVariant[event.type];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'motion-safe:animate-fade-in'
        )}
        aria-expanded={isOpen}
      >
        <span className="text-muted-foreground tabular-nums font-mono text-xs">
          {formatTimestamp(event.timestamp)}
        </span>
        <Badge variant={variant} className="min-w-[80px] justify-center">
          {event.type.replace(':', ' ')}
        </Badge>
        <span className="font-mono text-sm truncate flex-1">{getEventLabel(event)}</span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mx-3 my-2 p-3 bg-muted rounded-md text-xs font-mono overflow-auto max-h-64">
          {JSON.stringify(getEventDetails(event), null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function EventStream({ events }: EventStreamProps) {
  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        No events yet. Make some MCP requests to see them here.
      </div>
    );
  }

  return (
    <div className="divide-y" role="log" aria-live="polite" aria-label="Event stream">
      {events.map((event, index) => (
        <EventRow key={`${event.timestamp}-${index}`} event={event} />
      ))}
    </div>
  );
}
