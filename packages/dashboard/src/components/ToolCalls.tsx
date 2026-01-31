import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { ToolCall } from '@/types/events';

interface ToolCallsProps {
  toolCalls: ToolCall[];
}

function formatDuration(ms?: number): string {
  if (ms === undefined) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function truncateParams(params: unknown): string {
  const str = JSON.stringify(params);
  if (str.length <= 50) return str;
  return str.slice(0, 47) + '...';
}

export function ToolCalls({ toolCalls }: ToolCallsProps) {
  if (toolCalls.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        No tool calls yet
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tool</TableHead>
          <TableHead className="w-[200px]">Parameters</TableHead>
          <TableHead className="w-[80px] tabular-nums">Time</TableHead>
          <TableHead className="w-[80px] tabular-nums">Duration</TableHead>
          <TableHead className="w-[80px]">Outcome</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {toolCalls.map((call) => (
          <TableRow key={`${call.id}-${call.requestedAt}`}>
            <TableCell className="font-mono">{call.toolName}</TableCell>
            <TableCell className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">
              {truncateParams(call.params)}
            </TableCell>
            <TableCell className="font-mono text-xs tabular-nums">
              {formatTime(call.requestedAt)}
            </TableCell>
            <TableCell className="font-mono text-xs tabular-nums">
              {formatDuration(call.duration)}
            </TableCell>
            <TableCell>
              {call.success === undefined ? (
                <Badge variant="secondary">pending</Badge>
              ) : call.success ? (
                <Badge variant="response">success</Badge>
              ) : (
                <Badge variant="error">error</Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
