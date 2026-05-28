# Roadmap

This roadmap is intentionally high level. It should guide sequencing without
locking the project into premature implementation details.

## Phase 1: Repository Foundation

Goal: establish project direction and structure.

Status: complete for the initial MVP foundation.

Completed:

- defined the product vision
- documented early product decisions
- created the app and package layout
- selected the first implementation stack only where needed
- added local development and Docker Compose workflows

## Phase 2: MCP Inspector MVP

Goal: become useful for MCP developers as quickly as possible.

MCP Inspector is the first open-source product under the dr-w devtools lab. The
goal is developer adoption and daily debugging usefulness, not monetization or
enterprise platform scope.

MVP scope:

- connect to MCP servers, including local/stdin and remote servers
- save or reopen recent connections
- support environment variables and auth headers
- inspect tools, resources, prompts, schemas, and capabilities
- execute tool calls through a structured request editor
- view formatted JSON and raw requests/responses
- replay requests
- keep request history
- provide a timeline view
- import and export traces

Current implementation status:

- the web app has a focused inspector workbench UI
- the local runtime exposes the first typed API contract
- the UI can read runtime health, connections, capabilities, and history
- the UI can submit structured JSON tool calls to the runtime
- the runtime returns mock tool call responses using the shared request,
  response, raw protocol, and trace shapes
- the UI has fallback development data when the runtime is unavailable
- Docker Compose can run the web UI and runtime locally

Remaining MVP work:

- implement real MCP transport support in `packages/mcp-client`
- wire the runtime to real MCP capability discovery
- execute real tool calls through the runtime
- persist or otherwise manage local connection profiles
- persist request history in local storage, local files, or SQLite
- wire replay end to end from UI history to runtime execution
- define trace import/export format and UI flow

Out of scope for the MVP:

- billing
- hosted accounts
- mandatory SaaS usage
- enterprise access controls
- gateway infrastructure
- observability backend
- Kubernetes-first runtime orchestration
- hosted AI automation workflows

## Immediate Technical Roadmap

These are the next concrete steps before moving beyond the MVP.

### Step 1: Real `stdio` MCP Transport

Goal: make MCP Inspector useful against one real local MCP server path.

- implement a first `stdio` adapter in `packages/mcp-client`
- launch and manage a local MCP server process from the runtime
- discover real tools, resources, and prompts from the connected server
- map MCP protocol responses into the existing `packages/core` types
- handle startup failures, process exits, invalid commands, and timeout errors
- keep env var handling local to the runtime

This should come before polishing remote transports because local `stdio` is the
core browser-cannot-do-this runtime use case.

### Step 2: Runtime Connection Profiles

Goal: make the connection setup flow real instead of UI-only draft state.

- add runtime endpoints for creating/listing/selecting local connection profiles
- validate profile shape for `stdio`, HTTP, and SSE
- keep secrets out of persistent storage until there is an explicit redaction
  and storage policy
- update the UI so `+ New` creates a runtime-backed profile when the runtime is
  online

### Step 3: Real Tool Calls and Error Surfaces

Goal: make tool execution trustworthy for daily debugging.

- call real MCP tools through the selected runtime connection
- preserve formatted and raw request/response views
- capture transport errors, schema errors, tool errors, and runtime errors
- show clear UI states for success, failure, timeout, disconnected runtime, and
  invalid JSON input

### Step 4: Local History and Replay

Goal: turn tool calls into a repeatable debugging workflow.

- store request/response history locally
- make timeline entries selectable
- wire replay from a previous request id
- decide whether replay reuses the original input exactly or allows editing
  before execution

### Step 5: Trace Import and Export

Goal: allow developers to keep and share local debugging artifacts.

- define a minimal trace file format
- export selected requests, responses, raw protocol data, and timing metadata
- import traces into the timeline without requiring a live MCP server

### Step 6: Remote MCP Transports

Goal: support remote MCP servers after the local runtime path is real.

- implement HTTP/SSE transport adapters
- support auth headers without leaking secrets into UI logs or trace exports
- handle remote auth, network, CORS, and transport-specific errors cleanly

## Phase 3: Developer Workflow Improvements

Potential additions:

- response viewer improvements
- schema explorer
- saved sessions
- response diffing
- visual graph of tools and resources
- local server presets
- shareable local traces
- examples for common MCP servers

## Phase 4: Security Insights

Potential additions:

- risky tool detection
- missing auth visibility
- secret exposure warnings
- prompt injection indicators
- permission analysis
- dangerous tool description warnings
- unsafe server exposure checks

Security checks should initially be informative and non-blocking. The product
should teach developers what a risk means before it tries to enforce policy.
Security visibility is a differentiator, but it should not replace the initial
inspection and debugging positioning.

## Phase 5: Auth, Gateway, and Observability

Potential future direction:

- OAuth and JWT helpers
- API key helpers
- scope and RBAC helpers
- MCP gateway
- auth proxy
- rate limiting
- audit logs
- policy enforcement
- hosted observability
- team collaboration

These capabilities should be considered only after the inspector is useful as a
developer tool.

## Phase 6: Hosted Platform

Optional future direction:

- team workspaces
- cloud trace sharing
- hosted analytics
- advanced observability
- enterprise authentication
- governance dashboards

This phase should remain optional until the open-source inspector has clear
developer adoption and repeated usage.

## Success Metrics

Early success is not revenue.

Early success means:

- GitHub stars
- recurring developer usage
- community feedback
- contributors
- mentions in MCP developer communities
- developers using MCP Inspector in daily debugging workflows
