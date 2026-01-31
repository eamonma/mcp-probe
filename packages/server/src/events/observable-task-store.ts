import type { TaskStore, CreateTaskOptions } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { Task, Result, Request, RequestId } from '@modelcontextprotocol/sdk/types.js';
import type { EventBus } from './event-bus.js';

/**
 * A TaskStore wrapper that emits events to an EventBus.
 *
 * Wraps any TaskStore implementation and emits:
 * - task:created when a task is created
 * - task:status when a task's status changes
 *
 * Read operations (getTask, getTaskResult, listTasks) do not emit events.
 */
export class ObservableTaskStore implements TaskStore {
  constructor(
    private inner: TaskStore,
    private eventBus: EventBus
  ) {}

  async createTask(
    taskParams: CreateTaskOptions,
    requestId: RequestId,
    request: Request,
    sessionId?: string
  ): Promise<Task> {
    const task = await this.inner.createTask(taskParams, requestId, request, sessionId);

    // Extract tool info from request params
    const params = request.params as { name?: string; arguments?: unknown } | undefined;
    const toolName = params?.name ?? 'unknown';
    const toolArgs = params?.arguments;

    this.eventBus.emit({
      type: 'task:created',
      taskId: task.taskId,
      toolName,
      toolArgs,
      requestId,
    });

    return task;
  }

  async getTask(taskId: string, sessionId?: string): Promise<Task | null> {
    return this.inner.getTask(taskId, sessionId);
  }

  async updateTaskStatus(
    taskId: string,
    status: Task['status'],
    statusMessage?: string,
    sessionId?: string
  ): Promise<void> {
    // Get previous status for the event
    const previousTask = await this.inner.getTask(taskId, sessionId);
    const previousStatus = previousTask?.status ?? null;

    await this.inner.updateTaskStatus(taskId, status, statusMessage, sessionId);

    this.eventBus.emit({
      type: 'task:status',
      taskId,
      previousStatus,
      newStatus: status,
      statusMessage,
    });
  }

  async storeTaskResult(
    taskId: string,
    status: 'completed' | 'failed',
    result: Result,
    sessionId?: string
  ): Promise<void> {
    // Get previous status for the event
    const previousTask = await this.inner.getTask(taskId, sessionId);
    const previousStatus = previousTask?.status ?? null;

    await this.inner.storeTaskResult(taskId, status, result, sessionId);

    this.eventBus.emit({
      type: 'task:status',
      taskId,
      previousStatus,
      newStatus: status,
    });
  }

  async getTaskResult(taskId: string, sessionId?: string): Promise<Result> {
    return this.inner.getTaskResult(taskId, sessionId);
  }

  async listTasks(
    cursor?: string,
    sessionId?: string
  ): Promise<{ tasks: Task[]; nextCursor?: string }> {
    return this.inner.listTasks(cursor, sessionId);
  }
}
