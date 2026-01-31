import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObservableTaskStore } from './observable-task-store.js';
import { EventBus } from './event-bus.js';
import type { TaskStore, CreateTaskOptions } from '@modelcontextprotocol/sdk/experimental/tasks';
import type { Task, Request, RequestId } from '@modelcontextprotocol/sdk/types.js';
import type { TaskCreatedEvent, TaskStatusEvent } from './types.js';

// Mock TaskStore implementation
function createMockTaskStore(): TaskStore & {
  mockTask: Task;
  mockResult: unknown;
} {
  const mockTask: Task = {
    taskId: 'task-123',
    status: 'working',
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
    ttl: 60000,
  };

  return {
    mockTask,
    mockResult: { content: [{ type: 'text', text: 'result' }] },

    createTask: vi.fn().mockResolvedValue(mockTask),
    getTask: vi.fn().mockResolvedValue(mockTask),
    storeTaskResult: vi.fn().mockResolvedValue(undefined),
    getTaskResult: vi.fn().mockImplementation(function (this: { mockResult: unknown }) {
      return Promise.resolve(this.mockResult);
    }),
    updateTaskStatus: vi.fn().mockResolvedValue(undefined),
    listTasks: vi.fn().mockResolvedValue({ tasks: [mockTask] }),
  };
}

describe('ObservableTaskStore', () => {
  let innerStore: ReturnType<typeof createMockTaskStore>;
  let eventBus: EventBus;
  let store: ObservableTaskStore;

  beforeEach(() => {
    innerStore = createMockTaskStore();
    eventBus = new EventBus('session-1');
    store = new ObservableTaskStore(innerStore, eventBus);
  });

  describe('createTask', () => {
    it('delegates to inner store', async () => {
      const params: CreateTaskOptions = { ttl: 60000 };
      const requestId: RequestId = 1;
      const request: Request = { method: 'tools/call', params: { name: 'my_tool', arguments: { foo: 'bar' } } };

      await store.createTask(params, requestId, request, 'session-1');

      expect(innerStore.createTask).toHaveBeenCalledWith(params, requestId, request, 'session-1');
    });

    it('returns result from inner store', async () => {
      const params: CreateTaskOptions = { ttl: 60000 };
      const requestId: RequestId = 1;
      const request: Request = { method: 'tools/call' };

      const result = await store.createTask(params, requestId, request);

      expect(result).toEqual(innerStore.mockTask);
    });

    it('emits task:created event', async () => {
      const listener = vi.fn();
      eventBus.on('event', listener);

      const params: CreateTaskOptions = { ttl: 60000 };
      const requestId: RequestId = 42;
      const request: Request = {
        method: 'tools/call',
        params: { name: 'my_tool', arguments: { foo: 'bar' } },
      };

      await store.createTask(params, requestId, request);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as TaskCreatedEvent;
      expect(event.type).toBe('task:created');
      expect(event.taskId).toBe('task-123');
      expect(event.toolName).toBe('my_tool');
      expect(event.toolArgs).toEqual({ foo: 'bar' });
      expect(event.requestId).toBe(42);
    });

    it('handles missing tool params gracefully', async () => {
      const listener = vi.fn();
      eventBus.on('event', listener);

      const params: CreateTaskOptions = { ttl: 60000 };
      const request: Request = { method: 'tools/call' }; // No params

      await store.createTask(params, 1, request);

      const event = listener.mock.calls[0][0] as TaskCreatedEvent;
      expect(event.toolName).toBe('unknown');
      expect(event.toolArgs).toBeUndefined();
    });
  });

  describe('getTask', () => {
    it('delegates to inner store', async () => {
      await store.getTask('task-123', 'session-1');

      expect(innerStore.getTask).toHaveBeenCalledWith('task-123', 'session-1');
    });

    it('returns result from inner store', async () => {
      const result = await store.getTask('task-123');

      expect(result).toEqual(innerStore.mockTask);
    });

    it('does not emit events', async () => {
      const listener = vi.fn();
      eventBus.on('event', listener);

      await store.getTask('task-123');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('updateTaskStatus', () => {
    it('delegates to inner store', async () => {
      await store.updateTaskStatus('task-123', 'completed', 'Done!', 'session-1');

      expect(innerStore.updateTaskStatus).toHaveBeenCalledWith(
        'task-123',
        'completed',
        'Done!',
        'session-1'
      );
    });

    it('emits task:status event', async () => {
      const listener = vi.fn();
      eventBus.on('event', listener);

      // First call to getTask returns 'working' status
      innerStore.getTask = vi.fn().mockResolvedValue({
        ...innerStore.mockTask,
        status: 'working',
      });

      await store.updateTaskStatus('task-123', 'completed', 'Done!');

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as TaskStatusEvent;
      expect(event.type).toBe('task:status');
      expect(event.taskId).toBe('task-123');
      expect(event.previousStatus).toBe('working');
      expect(event.newStatus).toBe('completed');
      expect(event.statusMessage).toBe('Done!');
    });

    it('handles missing previous task gracefully', async () => {
      const listener = vi.fn();
      eventBus.on('event', listener);

      // Task doesn't exist yet
      innerStore.getTask = vi.fn().mockResolvedValue(null);

      await store.updateTaskStatus('task-123', 'working');

      const event = listener.mock.calls[0][0] as TaskStatusEvent;
      expect(event.previousStatus).toBeNull();
      expect(event.newStatus).toBe('working');
    });
  });

  describe('storeTaskResult', () => {
    it('delegates to inner store', async () => {
      const result = { content: [{ type: 'text', text: 'done' }] };

      await store.storeTaskResult('task-123', 'completed', result, 'session-1');

      expect(innerStore.storeTaskResult).toHaveBeenCalledWith(
        'task-123',
        'completed',
        result,
        'session-1'
      );
    });

    it('emits task:status event for final state', async () => {
      const listener = vi.fn();
      eventBus.on('event', listener);

      innerStore.getTask = vi.fn().mockResolvedValue({
        ...innerStore.mockTask,
        status: 'working',
      });

      const result = { content: [{ type: 'text', text: 'done' }] };
      await store.storeTaskResult('task-123', 'completed', result);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as TaskStatusEvent;
      expect(event.type).toBe('task:status');
      expect(event.newStatus).toBe('completed');
    });
  });

  describe('getTaskResult', () => {
    it('delegates to inner store', async () => {
      await store.getTaskResult('task-123', 'session-1');

      expect(innerStore.getTaskResult).toHaveBeenCalledWith('task-123', 'session-1');
    });

    it('returns result from inner store', async () => {
      const result = await store.getTaskResult('task-123');

      expect(result).toEqual(innerStore.mockResult);
    });

    it('does not emit events', async () => {
      const listener = vi.fn();
      eventBus.on('event', listener);

      await store.getTaskResult('task-123');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('listTasks', () => {
    it('delegates to inner store', async () => {
      await store.listTasks('cursor-abc', 'session-1');

      expect(innerStore.listTasks).toHaveBeenCalledWith('cursor-abc', 'session-1');
    });

    it('returns result from inner store', async () => {
      const result = await store.listTasks();

      expect(result).toEqual({ tasks: [innerStore.mockTask] });
    });

    it('does not emit events', async () => {
      const listener = vi.fn();
      eventBus.on('event', listener);

      await store.listTasks();

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
