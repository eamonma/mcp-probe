import { describe, it, expect, vi } from 'vitest';
import { SessionManager } from './session-manager.js';
import type { TaskStore } from '@modelcontextprotocol/sdk/experimental/tasks';

// Mock TaskStore for testing
function createMockTaskStore(): TaskStore {
  return {
    createTask: vi.fn(),
    getTask: vi.fn(),
    storeTaskResult: vi.fn(),
    getTaskResult: vi.fn(),
    updateTaskStatus: vi.fn(),
    listTasks: vi.fn(),
  };
}

describe('SessionManager', () => {
  describe('createSession', () => {
    it('creates a session with unique ID', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const session = sessionManager.createSession(
        { name: 'test-client', version: '1.0.0' },
        {}
      );

      expect(session.sessionId).toBeDefined();
      expect(typeof session.sessionId).toBe('string');
      expect(session.sessionId.length).toBeGreaterThan(0);
    });

    it('stores client info and capabilities', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const clientInfo = { name: 'test-client', version: '2.0.0' };
      const capabilities = { elicitation: { form: {} } };

      const session = sessionManager.createSession(clientInfo, capabilities);

      expect(session.clientInfo).toEqual(clientInfo);
      expect(session.capabilities).toEqual(capabilities);
    });

    it('records creation timestamp', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const before = new Date();
      const session = sessionManager.createSession(
        { name: 'test-client', version: '1.0.0' },
        {}
      );
      const after = new Date();

      expect(session.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(session.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('creates unique IDs for different sessions', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const session1 = sessionManager.createSession(
        { name: 'client-a', version: '1.0.0' },
        {}
      );
      const session2 = sessionManager.createSession(
        { name: 'client-b', version: '1.0.0' },
        {}
      );

      expect(session1.sessionId).not.toBe(session2.sessionId);
    });

    it('uses provided TaskStore factory', () => {
      const mockTaskStore = createMockTaskStore();
      const factory = vi.fn().mockReturnValue(mockTaskStore);

      const sessionManager = new SessionManager({
        createTaskStore: factory,
      });

      const session = sessionManager.createSession(
        { name: 'test-client', version: '1.0.0' },
        {}
      );

      expect(factory).toHaveBeenCalledWith(session.sessionId);
    });
  });

  describe('getSession', () => {
    it('returns session by ID', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const created = sessionManager.createSession(
        { name: 'test-client', version: '1.0.0' },
        {}
      );

      const retrieved = sessionManager.getSession(created.sessionId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.sessionId).toBe(created.sessionId);
    });

    it('returns undefined for non-existent session', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const retrieved = sessionManager.getSession('non-existent-id');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('deleteSession', () => {
    it('removes session and returns true', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const session = sessionManager.createSession(
        { name: 'test-client', version: '1.0.0' },
        {}
      );

      const result = sessionManager.deleteSession(session.sessionId);

      expect(result).toBe(true);
      expect(sessionManager.getSession(session.sessionId)).toBeUndefined();
    });

    it('returns false for non-existent session', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const result = sessionManager.deleteSession('non-existent-id');

      expect(result).toBe(false);
    });

    it('closes the transport when deleting', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const session = sessionManager.createSession(
        { name: 'test-client', version: '1.0.0' },
        {}
      );

      const closeSpy = vi.spyOn(session.transport, 'close');

      sessionManager.deleteSession(session.sessionId);

      expect(closeSpy).toHaveBeenCalled();
    });
  });

  describe('getAllSessions', () => {
    it('returns empty object when no sessions', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const sessions = sessionManager.getAllSessions();

      expect(sessions).toEqual({});
    });

    it('returns all sessions with their info', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const session1 = sessionManager.createSession(
        { name: 'client-a', version: '1.0.0' },
        { elicitation: { form: {} } }
      );
      const session2 = sessionManager.createSession(
        { name: 'client-b', version: '2.0.0' },
        {}
      );

      const sessions = sessionManager.getAllSessions();

      expect(Object.keys(sessions)).toHaveLength(2);
      expect(sessions[session1.sessionId].clientInfo.name).toBe('client-a');
      expect(sessions[session2.sessionId].clientInfo.name).toBe('client-b');
    });

    it('does not expose transport or server in getAllSessions', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      sessionManager.createSession(
        { name: 'test-client', version: '1.0.0' },
        {}
      );

      const sessions = sessionManager.getAllSessions();
      const sessionData = Object.values(sessions)[0];

      expect(sessionData).not.toHaveProperty('transport');
      expect(sessionData).not.toHaveProperty('server');
    });
  });

  describe('wrapTransport option', () => {
    it('calls wrapTransport with transport and sessionId', () => {
      const wrapTransport = vi.fn((transport, _sessionId) => transport);

      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
        wrapTransport,
      });

      const session = sessionManager.createSession(
        { name: 'test-client', version: '1.0.0' },
        {}
      );

      expect(wrapTransport).toHaveBeenCalledWith(
        expect.anything(), // transport
        session.sessionId
      );
    });

    it('uses wrapped transport in session', () => {
      // The wrapper modifies the transport in place, so we track if it was called
      let wrappedTransport: any = null;
      const wrapTransport = vi.fn((transport, _sessionId) => {
        wrappedTransport = transport;
        // Add a marker to verify this is the wrapped one
        (transport as any).__wrapped = true;
        return transport;
      });

      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
        wrapTransport,
      });

      const session = sessionManager.createSession(
        { name: 'test-client', version: '1.0.0' },
        {}
      );

      expect((session.transport as any).__wrapped).toBe(true);
      expect(session.transport).toBe(wrappedTransport);
    });
  });

  describe('updateSessionCapabilities', () => {
    it('updates capabilities for existing session', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      const session = sessionManager.createSession(
        { name: 'test-client', version: '1.0.0' },
        {}
      );

      const newCapabilities = { elicitation: { form: {} }, tasks: { list: {} } };
      sessionManager.updateSessionCapabilities(session.sessionId, newCapabilities);

      const updated = sessionManager.getSession(session.sessionId);
      expect(updated?.capabilities).toEqual(newCapabilities);
    });

    it('does nothing for non-existent session', () => {
      const sessionManager = new SessionManager({
        createTaskStore: createMockTaskStore,
      });

      // Should not throw
      sessionManager.updateSessionCapabilities('non-existent', { elicitation: { form: {} } });
    });
  });
});
