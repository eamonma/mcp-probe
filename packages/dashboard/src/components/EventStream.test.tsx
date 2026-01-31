import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EventStream } from './EventStream';
import type { Event, RequestEvent, ResponseEvent } from '@/types/events';

describe('EventStream', () => {
  it('renders empty state when no events', () => {
    render(<EventStream events={[]} />);
    expect(screen.getByText(/no events yet/i)).toBeInTheDocument();
  });

  it('renders list of events', () => {
    const events: Event[] = [
      {
        type: 'request',
        timestamp: Date.now(),
        id: 1,
        method: 'tools/call',
        params: { name: 'test' },
      },
      {
        type: 'response',
        timestamp: Date.now() + 1000,
        id: 1,
        result: {},
      },
    ];

    render(<EventStream events={events} />);

    expect(screen.getByText('tools/call')).toBeInTheDocument();
    expect(screen.getByText('result')).toBeInTheDocument();
  });

  it('shows correct badge for event type', () => {
    const events: Event[] = [
      {
        type: 'request',
        timestamp: Date.now(),
        id: 1,
        method: 'test',
      },
    ];

    render(<EventStream events={events} />);

    expect(screen.getByText('request')).toBeInTheDocument();
  });

  it('shows error badge for response with error', () => {
    const events: Event[] = [
      {
        type: 'response',
        timestamp: Date.now(),
        id: 1,
        error: { code: -32000, message: 'Error' },
      },
    ];

    render(<EventStream events={events} />);

    expect(screen.getByText('error')).toBeInTheDocument();
  });

  it('expands to show JSON on click', () => {
    const events: Event[] = [
      {
        type: 'request',
        timestamp: Date.now(),
        id: 1,
        method: 'test',
        params: { foo: 'bar' },
      },
    ];

    render(<EventStream events={events} />);

    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    // JSON should be visible after expanding
    expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();
  });

  it('formats timestamp correctly', () => {
    const timestamp = new Date('2024-01-15T10:30:45.123Z').getTime();
    const events: Event[] = [
      {
        type: 'request',
        timestamp,
        id: 1,
        method: 'test',
      },
    ];

    render(<EventStream events={events} />);

    // Should show time in HH:MM:SS.mmm format (locale-dependent)
    expect(screen.getByText(/\d{2}:\d{2}:\d{2}/)).toBeInTheDocument();
  });

  it('has correct ARIA attributes', () => {
    const events: Event[] = [
      {
        type: 'request',
        timestamp: Date.now(),
        id: 1,
        method: 'test',
      },
    ];

    render(<EventStream events={events} />);

    const log = screen.getByRole('log');
    expect(log).toHaveAttribute('aria-live', 'polite');
    expect(log).toHaveAttribute('aria-label', 'Event stream');
  });
});
