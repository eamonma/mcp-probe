import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TasksTable } from './TasksTable';
import type { ActiveTask } from '@/types/events';

describe('TasksTable', () => {
  it('renders empty state when no tasks', () => {
    render(<TasksTable tasks={[]} />);
    expect(screen.getByText(/no tasks/i)).toBeInTheDocument();
  });

  it('renders table with tasks', () => {
    const tasks: ActiveTask[] = [
      {
        taskId: 'task-123456789',
        toolName: 'test-tool',
        toolArgs: {},
        requestId: 1,
        status: 'working',
        createdAt: Date.now() - 5000,
        updatedAt: Date.now(),
      },
    ];

    render(<TasksTable tasks={tasks} />);

    expect(screen.getByText('test-tool')).toBeInTheDocument();
    expect(screen.getByText('task-123')).toBeInTheDocument(); // Truncated ID
    expect(screen.getByText('working')).toBeInTheDocument();
  });

  it('shows progress bar when progress is available', () => {
    const tasks: ActiveTask[] = [
      {
        taskId: 'task-1',
        toolName: 'test-tool',
        toolArgs: {},
        requestId: 1,
        status: 'working',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        progress: {
          current: 5,
          total: 10,
        },
      },
    ];

    render(<TasksTable tasks={tasks} />);

    expect(screen.getByText('5/10')).toBeInTheDocument();
  });

  it('applies correct status badge variant', () => {
    const tasks: ActiveTask[] = [
      {
        taskId: 'task-1',
        toolName: 'working-tool',
        toolArgs: {},
        requestId: 1,
        status: 'working',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    render(<TasksTable tasks={tasks} />);

    const badge = screen.getByText('working');
    expect(badge).toBeInTheDocument();
  });

  it('displays Last Updated column with formatted time per spec 5.2', () => {
    // Use a fixed timestamp for predictable testing
    const updatedAt = new Date('2024-01-15T14:32:15').getTime();
    const createdAt = updatedAt - 5000; // 5 seconds earlier

    const tasks: ActiveTask[] = [
      {
        taskId: 'task-1',
        toolName: 'test-tool',
        toolArgs: {},
        requestId: 1,
        status: 'working',
        createdAt,
        updatedAt,
      },
    ];

    render(<TasksTable tasks={tasks} />);

    // Header should say "Last Updated" not "Duration" per spec 5.2
    expect(screen.getByText('Last Updated')).toBeInTheDocument();

    // Content should show formatted time (e.g., "14:32:15"), not duration
    expect(screen.getByText('14:32:15')).toBeInTheDocument();
  });

  it('applies destructive variant for cancelled status (British spelling)', () => {
    const tasks: ActiveTask[] = [
      {
        taskId: 'task-1',
        toolName: 'cancelled-tool',
        toolArgs: {},
        requestId: 1,
        status: 'cancelled',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    render(<TasksTable tasks={tasks} />);

    const badge = screen.getByText('cancelled');
    expect(badge).toBeInTheDocument();
    // The badge should have destructive variant styling
    expect(badge).toHaveClass('bg-destructive');
  });

  it('renders input_required status with warning variant', () => {
    const tasks: ActiveTask[] = [
      {
        taskId: 'task-1',
        toolName: 'input-tool',
        toolArgs: {},
        requestId: 1,
        status: 'input_required',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    render(<TasksTable tasks={tasks} />);

    const badge = screen.getByText('input_required');
    expect(badge).toBeInTheDocument();
    // The badge should have the warning variant class
    expect(badge).toHaveClass('bg-yellow-500/15');
  });
});
