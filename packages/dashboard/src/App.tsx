import { useEvents } from '@/hooks/useEvents';
import { SessionPicker } from '@/components/SessionPicker';
import { EventStream } from '@/components/EventStream';
import { TasksTable } from '@/components/TasksTable';
import { ToolCalls } from '@/components/ToolCalls';
import { cn } from '@/lib/utils';

function ConnectionStatus({ status }: { status: string }) {
  const statusColors = {
    connected: 'bg-green-500',
    connecting: 'bg-yellow-500',
    disconnected: 'bg-gray-500',
    error: 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          'h-2 w-2 rounded-full',
          statusColors[status as keyof typeof statusColors] || 'bg-gray-500'
        )}
        aria-hidden="true"
      />
      <span className="text-sm text-muted-foreground capitalize">{status}</span>
    </div>
  );
}

export default function App() {
  const {
    events,
    activeTasks,
    toolCalls,
    sessions,
    connectionStatus,
    selectedSession,
    setSelectedSession,
  } = useEvents();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold">MCP Probe Dashboard</h1>
              <ConnectionStatus status={connectionStatus} />
            </div>
            <SessionPicker
              sessions={sessions}
              selectedSession={selectedSession}
              onSessionChange={setSelectedSession}
            />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Active Tasks */}
          <section className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Active Tasks</h2>
              <p className="text-sm text-muted-foreground">
                {activeTasks.length} task{activeTasks.length !== 1 ? 's' : ''} in progress
              </p>
            </div>
            <div className="p-4">
              <TasksTable tasks={activeTasks} />
            </div>
          </section>

          {/* Recent Tool Calls */}
          <section className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h2 className="font-semibold">Recent Tool Calls</h2>
              <p className="text-sm text-muted-foreground">
                Last {toolCalls.length} tool invocation{toolCalls.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="p-4">
              <ToolCalls toolCalls={toolCalls} />
            </div>
          </section>
        </div>

        {/* Event Stream */}
        <section className="mt-6 rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="font-semibold">Event Stream</h2>
            <p className="text-sm text-muted-foreground">
              Live JSON-RPC traffic ({events.length} events)
            </p>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            <EventStream events={events} />
          </div>
        </section>
      </main>
    </div>
  );
}
