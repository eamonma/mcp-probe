import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ToolCalls } from './ToolCalls';
import type { ToolCall } from '@/types/events';

describe('ToolCalls', () => {
  it('renders empty state when no tool calls', () => {
    render(<ToolCalls toolCalls={[]} />);
    expect(screen.getByText(/no tool calls yet/i)).toBeInTheDocument();
  });

  it('renders table with tool calls', () => {
    const toolCalls: ToolCall[] = [
      {
        id: 1,
        toolName: 'test-tool',
        params: { arg: 'value' },
        requestedAt: Date.now() - 1000,
        respondedAt: Date.now(),
        duration: 1000,
        success: true,
      },
    ];

    render(<ToolCalls toolCalls={toolCalls} />);

    expect(screen.getByText('test-tool')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
  });

  it('shows pending badge for unresolved calls', () => {
    const toolCalls: ToolCall[] = [
      {
        id: 1,
        toolName: 'test-tool',
        params: {},
        requestedAt: Date.now(),
      },
    ];

    render(<ToolCalls toolCalls={toolCalls} />);

    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('shows error badge for failed calls', () => {
    const toolCalls: ToolCall[] = [
      {
        id: 1,
        toolName: 'test-tool',
        params: {},
        requestedAt: Date.now() - 1000,
        respondedAt: Date.now(),
        duration: 1000,
        success: false,
        error: { code: -32000, message: 'Failed' },
      },
    ];

    render(<ToolCalls toolCalls={toolCalls} />);

    expect(screen.getByText('error')).toBeInTheDocument();
  });

  it('truncates long parameters', () => {
    const toolCalls: ToolCall[] = [
      {
        id: 1,
        toolName: 'test-tool',
        params: {
          veryLongParameterName: 'This is a very long value that should be truncated',
        },
        requestedAt: Date.now(),
        respondedAt: Date.now(),
        duration: 100,
        success: true,
      },
    ];

    render(<ToolCalls toolCalls={toolCalls} />);

    // Should show truncated params with ellipsis
    expect(screen.getByText(/\.\.\./)).toBeInTheDocument();
  });

  it('formats duration correctly', () => {
    const toolCalls: ToolCall[] = [
      {
        id: 1,
        toolName: 'fast-tool',
        params: {},
        requestedAt: Date.now() - 50,
        respondedAt: Date.now(),
        duration: 50,
        success: true,
      },
      {
        id: 2,
        toolName: 'slow-tool',
        params: {},
        requestedAt: Date.now() - 2500,
        respondedAt: Date.now(),
        duration: 2500,
        success: true,
      },
    ];

    render(<ToolCalls toolCalls={toolCalls} />);

    expect(screen.getByText('50ms')).toBeInTheDocument();
    expect(screen.getByText('2.5s')).toBeInTheDocument();
  });
});
