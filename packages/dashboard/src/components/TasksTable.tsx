import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { ActiveTask } from '@/types/events';

interface TasksTableProps {
  tasks: ActiveTask[];
}

function formatDuration(start: number, end: number): string {
  const duration = end - start;
  if (duration < 1000) return `${duration}ms`;
  if (duration < 60000) return `${(duration / 1000).toFixed(1)}s`;
  return `${(duration / 60000).toFixed(1)}m`;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'task' | 'warning' {
  switch (status) {
    case 'working':
    case 'in_progress':
      return 'task';
    case 'completed':
      return 'secondary';
    case 'failed':
    case 'cancelled':
      return 'destructive';
    case 'input_required':
      return 'warning';
    default:
      return 'default';
  }
}

export function TasksTable({ tasks }: TasksTableProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        No active tasks
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[100px]">Task ID</TableHead>
          <TableHead>Tool</TableHead>
          <TableHead className="w-[100px]">Status</TableHead>
          <TableHead className="w-[120px]">Progress</TableHead>
          <TableHead className="w-[80px] tabular-nums">Created</TableHead>
          <TableHead className="w-[80px] tabular-nums">Last Updated</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.taskId}>
            <TableCell className="font-mono text-xs tabular-nums">
              {task.taskId.slice(0, 8)}
            </TableCell>
            <TableCell className="font-mono">{task.toolName}</TableCell>
            <TableCell>
              <Badge variant={getStatusVariant(task.status)}>
                {task.status}
              </Badge>
            </TableCell>
            <TableCell className="tabular-nums">
              {task.progress ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-[width] duration-300"
                      style={{
                        width: task.progress.total
                          ? `${(task.progress.current / task.progress.total) * 100}%`
                          : '0%',
                      }}
                    />
                  </div>
                  {task.progress.total && (
                    <span className="text-xs text-muted-foreground">
                      {task.progress.current}/{task.progress.total}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell className="font-mono text-xs tabular-nums">
              {formatTime(task.createdAt)}
            </TableCell>
            <TableCell className="font-mono text-xs tabular-nums">
              {formatTime(task.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
