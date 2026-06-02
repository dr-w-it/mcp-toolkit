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

## Phase 2: MCP Toolkit Local Workbench MVP

Goal: become useful for MCP developers as quickly as possible.

MCP Toolkit is the first open-source product under the dr-w devtools lab. The
goal is developer adoption and daily debugging usefulness, not monetization,
head-to-head generic inspection competition, or enterprise platform scope.

MVP scope:

- connect to MCP servers, including local/stdin and remote servers
- save or reopen recent connections
- support environment variables and auth headers
- inspect tools, resources, prompts, schemas, and capabilities
- execute tool calls through a structured request editor
- save requests for repeatable local workflows
- view formatted JSON and raw requests/responses
- replay requests
- keep request history
- provide a trace timeline view
- compare traces and responses
- import, sanitize, and export traces
- surface security review signals and local audit reports

Current implementation status:

- the web app has a focused local workbench UI
- the local runtime exposes the first typed API contract
- the UI can read runtime health, connections, capabilities, and history
- the UI can submit structured JSON tool calls to the runtime
- the runtime can launch a real local `stdio` MCP filesystem server
- the runtime can discover real MCP capabilities and execute real MCP tool calls
  through `packages/mcp-client`
- tool call responses preserve formatted output and raw protocol data for the
  response viewer
- the runtime can create and list in-memory connection profiles for `stdio`,
  HTTP, and SSE shapes
- the UI has fallback development data when the runtime is unavailable
- Docker Compose can run the web UI and runtime locally

Remaining MVP work:

- persist local connection profiles once a secret storage and redaction policy
  exists
- improve saved requests and request history as explicit local workflows
- harden replay and error surfaces around real runtime execution
- add trace timeline navigation
- add trace diff and response comparison
- add a security review panel
- add secret redaction for local history and trace surfaces
- add risky tool detection
- add trace export sanitization
- add a local audit report

Near-term roadmap items:

- Saved Requests
- Trace timeline
- Trace diff / response comparison
- Security Review panel
- Secret redaction
- Risky tool detection
- Trace export sanitization
- Local audit report

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

Goal: make MCP Toolkit useful against one real local MCP server path.

Status: complete for the first local filesystem-server path.

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

Status: complete for runtime-managed in-memory profiles; durable persistence is
intentionally deferred until there is a storage and redaction policy.

- add runtime endpoints for creating/listing/selecting local connection profiles
- validate profile shape for `stdio`, HTTP, and SSE
- keep secrets out of persistent storage until there is an explicit redaction
  and storage policy
- update the UI so `+ New` creates a runtime-backed profile when the runtime is
  online

### Step 3: Real Tool Calls and Error Surfaces

Goal: make tool execution trustworthy for daily debugging.

Status: partially complete for `stdio`; remaining work is focused on broader
error states and UI polish.

- call real MCP tools through the selected runtime connection
- preserve formatted and raw request/response views
- capture transport errors, schema errors, tool errors, and runtime errors
- show clear UI states for success, failure, timeout, disconnected runtime, and
  invalid JSON input

### Step 4: Saved Requests, Local History, and Replay

Goal: turn tool calls into a repeatable debugging workflow.

- store request/response history locally
- save named requests independently from raw history
- make timeline entries selectable
- wire replay from a previous request id
- decide whether replay reuses the original input exactly or allows editing
  before execution

### Step 5: Trace Timeline, Diff, Import, and Export

Goal: allow developers to keep and share local debugging artifacts.

- define a minimal trace file format
- add a trace timeline for request, response, timing, and error events
- compare two traces or responses to highlight behavior changes
- export selected requests, responses, raw protocol data, and timing metadata
- sanitize trace exports before sharing
- import traces into the timeline without requiring a live MCP server

### Step 6: Remote MCP Transports

Goal: support remote MCP servers after the local runtime path is real.

- implement HTTP/SSE transport adapters
- support auth headers without leaking secrets into UI logs or trace exports
- handle remote auth, network, CORS, and transport-specific errors cleanly

### Step 7: Security Review and Local Audit

Goal: make security review a useful local workflow without turning the MVP into
an enforcement platform.

- add a security review panel
- detect risky tools and risky tool descriptions
- surface missing auth and unsafe exposure signals
- redact secrets from history, traces, and exports
- generate a local audit report from selected traces and server capabilities

## Phase 3: Developer Workflow Improvements

Potential additions:

- response viewer improvements
- schema explorer
- saved sessions
- saved requests
- response diffing
- visual graph of tools and resources
- local server presets
- shareable local traces
- examples for common MCP servers

## Phase 4: Security Insights

Potential additions:

- risky tool detection
- missing auth visibility
- security review panel
- secret redaction
- trace export sanitization
- local audit report
- secret exposure warnings
- prompt injection indicators
- permission analysis
- dangerous tool description warnings
- unsafe server exposure checks

Security checks should initially be informative and non-blocking. The product
should teach developers what a risk means before it tries to enforce policy.
Security visibility is a differentiator, but it should stay tied to concrete
local debugging, replay, trace, and audit workflows.

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

These capabilities should be considered only after the local workbench is useful
as a developer tool.

## Phase 6: Hosted Platform

Optional future direction:

- team workspaces
- cloud trace sharing
- hosted analytics
- advanced observability
- enterprise authentication
- governance dashboards

This phase should remain optional until the open-source workbench has clear
developer adoption and repeated usage.

## Success Metrics

Early success is not revenue.

Early success means:

- GitHub stars
- recurring developer usage
- community feedback
- contributors
- mentions in MCP developer communities
- developers using MCP Toolkit in daily debugging, replay, and security review
  workflows
