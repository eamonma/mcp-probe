import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SessionSummary } from '@/types/events';

interface SessionPickerProps {
  sessions: SessionSummary[];
  selectedSession: string;
  onSessionChange: (sessionId: string) => void;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

function getSessionLabel(session: SessionSummary): string {
  const shortId = session.sessionId.slice(0, 8);
  if (session.clientInfo) {
    return `${session.clientInfo.name} (${shortId})`;
  }
  return shortId;
}

export function SessionPicker({
  sessions,
  selectedSession,
  onSessionChange,
}: SessionPickerProps) {
  // Sort sessions by creation time, newest first
  const sortedSessions = [...sessions].sort((a, b) => {
    if (!a.createdAt || !b.createdAt) return 0;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <Select value={selectedSession} onValueChange={onSessionChange}>
      <SelectTrigger className="w-[320px]" aria-label="Select session">
        <SelectValue placeholder="Select a session" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="*">
          <span className="flex items-center gap-2">
            <span>All sessions</span>
            <span className="text-muted-foreground tabular-nums">
              ({sessions.length})
            </span>
          </span>
        </SelectItem>
        {sortedSessions.map((session) => (
          <SelectItem key={session.sessionId} value={session.sessionId}>
            <span className="flex flex-col">
              <span className="flex items-center gap-2">
                <span>{getSessionLabel(session)}</span>
                <span className="text-muted-foreground tabular-nums">
                  ({session.eventCount})
                </span>
              </span>
              {session.createdAt && (
                <span className="text-xs text-muted-foreground">
                  Started {formatRelativeTime(session.createdAt)}
                </span>
              )}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
