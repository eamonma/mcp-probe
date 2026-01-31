# MCP Probe: Product Specification

**Version**: 1.0  
**Date**: January 2026  
**Domain**: `mcp.eamon.io`

---

## 1. Problem Statement

The Model Context Protocol (MCP) specification includes features—particularly **tasks** (Nov 2025) and **progress notifications**—that are underserved by existing tooling. Developers building MCP clients or evaluating client conformance have no easy way to:

1. Verify whether a client supports a given MCP feature
2. Observe _how_ a client handles that feature (UI rendering, error handling)
3. Isolate protocol behavior from application logic

Existing MCP servers are _functional_ (they do real work) rather than _diagnostic_ (they exercise protocol features). This gap makes conformance testing unnecessarily difficult.

---

## 2. Goals

| Goal                    | Description                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------ |
| **Conformance probing** | Exercise MCP features independently so developers can diagnose client support        |
| **Observability**       | Provide a live dashboard showing protocol-level events from the server's perspective |
| **Reference quality**   | Serve as a clean, readable implementation using the official TypeScript SDK          |
| **Deployable**          | Run in a real environment (Azure) with minimal operational overhead                  |

## 3. Non-Goals

| Non-Goal                     | Rationale                                               |
| ---------------------------- | ------------------------------------------------------- |
| Authentication/authorization | Adds complexity; inputs are restricted to prevent abuse |
| Persistent storage           | Tasks are ephemeral; no database required               |
| High availability            | Acceptable to restart on failure; no auto-scaling       |
| Agentic workflows            | Focus is protocol features, not LLM orchestration       |
| STDIO transport              | Streamable HTTP only; STDIO is out of scope             |

---

## 4. Tool Specifications

All tools accept **bounded numeric parameters and enums only**—no free-form text. This eliminates abuse vectors without requiring auth.

### 4.1 `simple_tool`

**Purpose**: Baseline validation that the client can invoke a tool and receive a response.

| Aspect     | Detail                                       |
| ---------- | -------------------------------------------- |
| Type       | Synchronous                                  |
| Exercises  | Basic tool invocation                        |
| Parameters | `delayMs`: number (0–5000)                   |
| Behavior   | Waits `delayMs`, returns success message     |
| Returns    | `{ message: "Completed after {delayMs}ms" }` |

---

### 4.2 `sync_with_progress`

**Purpose**: Test progress notifications _without_ task machinery.

| Aspect     | Detail                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Type       | Synchronous                                                                                                                              |
| Exercises  | `notifications/progress`                                                                                                                 |
| Parameters | `itemCount`: number (1–100), `delayPerItemMs`: number (10–1000), `mode`: enum (`determinate` \| `indeterminate`)                         |
| Behavior   | Iterates through items, sending progress notifications. In `determinate` mode, includes `total`. In `indeterminate` mode, omits `total`. |
| Returns    | `{ processedItems: number }`                                                                                                             |

**Protocol emissions**:

```jsonc
// Determinate mode
{ "method": "notifications/progress", "params": { "progressToken": "...", "progress": 25, "total": 100, "message": "Processing item 25 of 100" } }

// Indeterminate mode
{ "method": "notifications/progress", "params": { "progressToken": "...", "progress": 25, "message": "Processing item 25..." } }
```

---

### 4.3 `pure_task`

**Purpose**: Test the task state machine in isolation, without progress notifications.

| Aspect     | Detail                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Type       | Task (async)                                                                                                                       |
| Exercises  | Task lifecycle: `queued` → `working` → `completed`                                                                                 |
| Parameters | `durationMs`: number (1000–60000)                                                                                                  |
| Behavior   | Returns task handle immediately. Task transitions through states, completes after `durationMs`. No progress notifications emitted. |
| Returns    | Task handle, then final result via `tasks/result`                                                                                  |

**Protocol emissions**:

```jsonc
{ "method": "notifications/tasks/status", "params": { "taskId": "...", "status": "queued", ... } }
{ "method": "notifications/tasks/status", "params": { "taskId": "...", "status": "working", ... } }
{ "method": "notifications/tasks/status", "params": { "taskId": "...", "status": "completed", ... } }
```

---

### 4.4 `task_with_progress`

**Purpose**: Test the combination of tasks and progress notifications.

| Aspect     | Detail                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| Type       | Task (async)                                                                                           |
| Exercises  | Task lifecycle + `notifications/progress`                                                              |
| Parameters | `itemCount`: number (1–100), `delayPerItemMs`: number (10–1000)                                        |
| Behavior   | Returns task handle. Emits both task status changes and progress notifications as items are processed. |
| Returns    | Task handle, progress during execution, final result                                                   |

**Protocol emissions**: Both `notifications/tasks/status` and `notifications/progress` interleaved.

---

### 4.5 `cancellable_task`

**Purpose**: Test `tasks/cancel` support.

| Aspect     | Detail                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Type       | Task (async)                                                                                                                                           |
| Exercises  | `tasks/cancel`, `cancelled` state                                                                                                                      |
| Parameters | `durationMs`: number (10000–120000)                                                                                                                    |
| Behavior   | Runs for `durationMs` (default: long enough to cancel). Responds to `tasks/cancel` by transitioning to `cancelled` state. Emits progress every second. |
| Returns    | Task handle; final status depends on whether cancelled                                                                                                 |

**Expected client behavior**: Client should provide UI affordance to cancel. Server should reject cancel requests for already-terminal tasks with error code `-32602`.

---

### 4.6 `multi_stage_task`

**Purpose**: Test progress `message` field changes across stages.

| Aspect     | Detail                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type       | Task (async)                                                                                                                                                |
| Exercises  | Progress `message` semantics                                                                                                                                |
| Parameters | `stageCount`: number (2–10), `msPerStage`: number (500–10000)                                                                                               |
| Behavior   | Progresses through named stages (e.g., "Initializing", "Processing", "Finalizing"). Each stage updates the `message` field. Progress is reported per-stage. |
| Returns    | Task handle, final result listing stages completed                                                                                                          |

**Protocol emissions**:

```jsonc
{ "method": "notifications/progress", "params": { "progressToken": "...", "progress": 1, "total": 3, "message": "Stage 1: Initializing" } }
{ "method": "notifications/progress", "params": { "progressToken": "...", "progress": 2, "total": 3, "message": "Stage 2: Processing" } }
{ "method": "notifications/progress", "params": { "progressToken": "...", "progress": 3, "total": 3, "message": "Stage 3: Finalizing" } }
```

---

### 4.7 `failing_task`

**Purpose**: Test task `failed` state handling.

| Aspect     | Detail                                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Type       | Task (async)                                                                                                                       |
| Exercises  | `failed` state, error reporting                                                                                                    |
| Parameters | `failAfterMs`: number (1000–30000), `errorCode`: enum (`timeout` \| `internal` \| `validation`)                                    |
| Behavior   | Runs normally, then deterministically fails after `failAfterMs`. Transitions to `failed` state with appropriate error information. |
| Returns    | Task handle; final status is `failed` with error details                                                                           |

**Protocol emissions**:

```jsonc
{ "method": "notifications/tasks/status", "params": { "taskId": "...", "status": "failed", "error": { "code": "internal", "message": "Simulated internal error" }, ... } }
```

---

### 4.8 `pausable_task`

**Purpose**: Test `input_required` state for human-in-the-loop workflows.

| Aspect     | Detail                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type       | Task (async)                                                                                                                                             |
| Exercises  | `input_required` state                                                                                                                                   |
| Parameters | `itemCount`: number (1–50), `pauseAfterItem`: number (1–49)                                                                                              |
| Behavior   | Processes items, pauses at `pauseAfterItem` and transitions to `input_required`. Waits for client to provide continuation signal. Resumes and completes. |
| Returns    | Task handle; pauses mid-execution awaiting input                                                                                                         |

**Expected client behavior**: Client should display that input is required and provide mechanism to continue.

---

### 4.9 `sampling_demo`

**Purpose**: Demonstrate `sampling/createMessage` by requesting an LLM response from the client.

| Aspect     | Detail                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| Type       | Synchronous                                                            |
| Exercises  | `sampling/createMessage`                                               |
| Parameters | `theme`: enum, `style`: enum, `maxTokens`: number (16–256)             |
| Behavior   | Requests a sampled response from the client and returns the text block |
| Returns    | Sampled text content                                                   |

**Expected client behavior**: Client should prompt the user for sampling approval and return text content.

---

## 5. Dashboard Requirements

### 5.1 Access

- **URL**: `https://mcp.eamon.io/dashboard`
- **Same origin** as MCP endpoint (`/mcp`)
- **Observe-only**: No ability to trigger tools or modify state

### 5.2 Components

| Component              | Description                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| **Event stream**       | Live, scrolling log of all JSON-RPC messages (requests received, notifications sent). Newest at top.     |
| **Active tasks table** | Columns: Task ID, Tool, Status, Progress (if any), Created, Last Updated. Auto-updates on status change. |
| **Recent tool calls**  | Last 50 tool invocations with: tool name, parameters, duration, outcome (success/error).                 |

### 5.3 Technical

- React SPA (Vite)
- Connects to server via SSE for real-time updates
- No authentication required
- Mobile-friendly not required (desktop-first)
- Retention: In-memory only (lost on restart; acceptable)

---

## 6. Infrastructure Requirements

### 6.1 Azure Resources

| Resource               | Configuration                           |
| ---------------------- | --------------------------------------- |
| **Container App**      | Single container, consumption tier      |
| **Container Registry** | Azure Container Registry (Basic SKU)    |
| **Custom Domain**      | `mcp.eamon.io` with managed certificate |

### 6.2 Deployment

- **IaC**: Bicep templates in `/infra`
- **CI/CD**: GitHub Actions
  - On push to `main`: build, push to ACR, deploy to Container App
- **Container**: `node:20-alpine` base image

### 6.3 Endpoints

| Path                | Method | Purpose                                       |
| ------------------- | ------ | --------------------------------------------- |
| `/mcp`              | POST   | MCP Streamable HTTP endpoint                  |
| `/mcp`              | GET    | SSE stream for server-to-client notifications |
| `/mcp`              | DELETE | Session termination                           |
| `/dashboard`        | GET    | Serve React SPA                               |
| `/dashboard/events` | GET    | SSE stream for dashboard updates              |
| `/health`           | GET    | Health check for container orchestration      |

---

## 7. Technical Decisions

| Decision  | Choice                           | Rationale                                      |
| --------- | -------------------------------- | ---------------------------------------------- |
| SDK       | `@modelcontextprotocol/sdk` v2.x | Tasks only available in v2                     |
| Transport | Streamable HTTP                  | Required for remote access; STDIO out of scope |
| Framework | Express or Hono                  | SDK has middleware packages for both           |
| Dashboard | React + Vite                     | Simple, fast builds                            |
| State     | In-memory                        | No persistence requirements                    |
| Auth      | None                             | Inputs restricted to prevent abuse             |

---

## 8. Open Questions

| Question             | Status           | Notes                                              |
| -------------------- | ---------------- | -------------------------------------------------- |
| SDK v2 stability     | **Monitor**      | Tasks are experimental; API may change             |
| VS Code task support | **Verify**       | Primary test client; confirm it handles all states |
| Rate limiting        | **Decide later** | May add at HTTP layer if abused                    |

---

## 9. Future Work (v2+)

| Feature                    | Description                                        |
| -------------------------- | -------------------------------------------------- |
| **Logging tools**          | Emit `notifications/message` at various log levels |
| **Sampling**               | Server requests client to perform LLM completion   |
| **Resource subscriptions** | Test `resources/subscribe` with changing data      |
| **Completions**            | Test argument autocompletion                       |
| **Tool annotations**       | Exercise `readOnlyHint`, `destructiveHint`, etc.   |

---

## 10. Success Criteria

1. All 8 tools function correctly against the MCP spec
2. VS Code (or other compliant client) can invoke each tool and observe expected behavior
3. Dashboard displays real-time protocol events
4. Deployed to `mcp.eamon.io` via GitHub Actions
5. Cold start < 10 seconds

---

## Appendix A: Parameter Bounds Summary

| Tool                 | Parameters                                                  |
| -------------------- | ----------------------------------------------------------- |
| `simple_tool`        | `delayMs`: 0–5000                                           |
| `sync_with_progress` | `itemCount`: 1–100, `delayPerItemMs`: 10–1000, `mode`: enum |
| `pure_task`          | `durationMs`: 1000–60000                                    |
| `task_with_progress` | `itemCount`: 1–100, `delayPerItemMs`: 10–1000               |
| `cancellable_task`   | `durationMs`: 10000–120000                                  |
| `multi_stage_task`   | `stageCount`: 2–10, `msPerStage`: 500–10000                 |
| `failing_task`       | `failAfterMs`: 1000–30000, `errorCode`: enum                |
| `pausable_task`      | `itemCount`: 1–50, `pauseAfterItem`: 1–49                   |
| `sampling_demo`      | `theme`: enum, `style`: enum, `maxTokens`: 16–256           |
