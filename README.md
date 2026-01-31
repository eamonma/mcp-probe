# MCP Probe

A diagnostic server for testing Model Context Protocol (MCP) client implementations.

## What It Does

MCP Probe exposes 8 diagnostic tools that exercise MCP protocol features—tasks, progress notifications, cancellation, failure states—so developers can verify their clients handle each correctly. A live dashboard shows all protocol traffic in real-time.

## Why It Exists

MCP's task and progress features (added Nov 2025) lack testing tools. Existing MCP servers do real work; this one is purely diagnostic. Point any MCP client at it to see exactly what your client supports and how it behaves.

## Quick Start

```bash
npm install
npm run dev          # Server at http://localhost:3000
npm run dev:dashboard # Dashboard at http://localhost:5173
```

## Project Structure

```
packages/
  server/     # MCP diagnostic server (Express + @modelcontextprotocol/sdk)
  dashboard/  # Real-time protocol viewer (React + Vite)
docs/
  spec.md     # Product specification
  PLAN.md     # Implementation plan
```

## Deployment

Azure Container Apps at `mcp.eamon.io`. CI/CD via GitHub Actions on push to main.

## Tools

| Tool | Tests |
|------|-------|
| `simple_tool` | Basic tool invocation |
| `sync_with_progress` | Progress notifications |
| `pure_task` | Task state machine |
| `task_with_progress` | Tasks + progress combined |
| `cancellable_task` | Task cancellation |
| `multi_stage_task` | Progress message changes |
| `failing_task` | Failed state handling |
| `pausable_task` | Input-required state |
