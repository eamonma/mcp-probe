import { InMemoryTaskStore } from '@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory';
import { isTerminal } from '@modelcontextprotocol/sdk/experimental/tasks/interfaces';
import type { CreateTaskOptions, Request, Task } from '@modelcontextprotocol/sdk/experimental/tasks/interfaces';
import type { RequestId, Result } from '@modelcontextprotocol/sdk/types';

export class TaskStoreWithQueuedStatus extends InMemoryTaskStore {
  async createTask(taskParams: CreateTaskOptions, requestId: RequestId, request: Request, sessionId?: string): Promise<Task> {
    const task = await super.createTask(taskParams, requestId, request, sessionId);
    await super.updateTaskStatus(task.taskId, 'queued', undefined, sessionId);
    return (await super.getTask(task.taskId, sessionId)) ?? task;
  }

  async updateTaskStatus(taskId: string, status: Task['status'], statusMessage?: string, sessionId?: string): Promise<void> {
    if (status === 'queued') {
      const stored = await super.getTask(taskId, sessionId);
      if (stored && isTerminal(stored.status)) {
        throw new Error(`Cannot update task ${taskId} from terminal status '${stored.status}' to '${status}'.`);
      }
      const tasks = (this as unknown as { tasks: Map<string, { task: Task; result?: Result }> }).tasks;
      const entry = tasks.get(taskId);
      if (!entry) {
        throw new Error(`Task with ID ${taskId} not found`);
      }
      entry.task.status = 'queued';
      if (statusMessage) {
        entry.task.statusMessage = statusMessage;
      }
      entry.task.lastUpdatedAt = new Date().toISOString();
      return;
    }

    await super.updateTaskStatus(taskId, status, statusMessage, sessionId);
  }
}
