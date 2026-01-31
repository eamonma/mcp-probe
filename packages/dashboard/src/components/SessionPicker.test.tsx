import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { SessionPicker } from './SessionPicker';
import type { SessionSummary } from '@/types/events';

describe('SessionPicker', () => {
  it('renders with placeholder', () => {
    render(
      <SessionPicker sessions={[]} selectedSession="*" onSessionChange={() => {}} />
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows all sessions option in dropdown', () => {
    render(
      <SessionPicker sessions={[]} selectedSession="*" onSessionChange={() => {}} />
    );

    // Open dropdown
    fireEvent.click(screen.getByRole('combobox'));

    // Find within the listbox (dropdown content)
    const listbox = screen.getByRole('listbox');
    expect(within(listbox).getByText('All sessions')).toBeInTheDocument();
  });

  it('lists available sessions in dropdown', () => {
    const sessions: SessionSummary[] = [
      {
        sessionId: 'session-1',
        eventCount: 10,
        clientInfo: { name: 'Test Client', version: '1.0.0' },
      },
      {
        sessionId: 'abcdefgh12345',
        eventCount: 5,
      },
    ];

    render(
      <SessionPicker
        sessions={sessions}
        selectedSession="*"
        onSessionChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    // First session has client info, so show client name with short session ID
    expect(within(listbox).getByText(/Test Client \(session-/)).toBeInTheDocument();
    // Second session has no client info, so show first 8 chars of session ID
    expect(within(listbox).getByText(/abcdefgh/)).toBeInTheDocument();
  });

  it('shows event count for each session', () => {
    const sessions: SessionSummary[] = [
      {
        sessionId: 'session-1',
        eventCount: 42,
      },
    ];

    render(
      <SessionPicker
        sessions={sessions}
        selectedSession="*"
        onSessionChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));

    expect(screen.getByText('(42)')).toBeInTheDocument();
  });

  it('calls onSessionChange when session is selected', () => {
    const onSessionChange = vi.fn();
    const sessions: SessionSummary[] = [
      { sessionId: 'abcd1234efgh', eventCount: 10 },
    ];

    render(
      <SessionPicker
        sessions={sessions}
        selectedSession="*"
        onSessionChange={onSessionChange}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    // Click the option showing first 8 chars
    const option = within(listbox).getByText(/abcd1234/);
    fireEvent.click(option);

    expect(onSessionChange).toHaveBeenCalledWith('abcd1234efgh');
  });

  it('has accessible label', () => {
    render(
      <SessionPicker sessions={[]} selectedSession="*" onSessionChange={() => {}} />
    );

    expect(screen.getByLabelText('Select session')).toBeInTheDocument();
  });
});
