# Product Decisions

This document records early product decisions for MCP Toolkit.

## Decisions

### dr-w is the umbrella identity

The project should live under **dr-w**, a personal engineering and devtools lab.

The identity comes from the historical `wahrheit` nickname and the
`dr-wahrheit` GitHub identity. It should feel authentic, technical, old-school
internet, open-source oriented, experimentation-friendly, and developer-first.

The ecosystem should live under `dr-w.it`, with products exposed as individual
tools. Near-term names should prefer workbench, replay, trace, and security
language over making "inspector" the public product identity:

- `toolkit.dr-w.it`
- `workbench.dr-w.it`
- `security-workbench.dr-w.it`
- `traces.dr-w.it`
- `gateway.dr-w.it`
- `auth.dr-w.it`

This avoids creating a generic startup-style AI/devtools brand too early.

### The first product direction is MCP Toolkit

MCP Toolkit starts as a local-first MCP workbench for debugging, replaying, and
securing MCP server interactions.

MCP Toolkit is positioned as a developer tool, not an AI application platform.
It should be closer to a local workbench, request replay tool, trace review
surface, and security review workflow than to a chatbot, prompt playground, or
low-code agent builder.

The initial positioning is debugging, replay, traceability, and security review.
Generic inspection should be treated as a necessary capability, not the primary
competitive story.

"MCP Inspector" may remain as an internal or local module name where it matches
the existing workspace layout, but it should not be the main public product name
unless clearly qualified.

### The project starts open-source-first

The initial project should be useful as open-source local tooling before any
hosted or commercial product is considered.

MCP Toolkit should be web-first, but not cloud-first. Developers should be able
to run the product locally from the open-source repository without relying on a
hosted SaaS service.

### Developer adoption comes before monetization

The first goal is adoption by MCP developers.

Monetization, billing, paid hosting, and enterprise packaging are not part of
the initial scope.

Early success should be measured by developer usage, GitHub visibility,
contributors, community feedback, and repeated debugging workflows.

### The MVP must stay narrow

The MVP is limited to:

- connect
- inspect
- call
- save
- replay
- review

Anything outside this flow should be treated as future scope unless it is needed
to make the MVP work.

### UI and MCP execution are separate concerns

The primary UI should be a web application. MCP execution should happen through
an Inspector Runtime that can run locally for private/local MCP servers or later
in hosted infrastructure for SaaS workflows.

This avoids tying the core product to a desktop app while still supporting MCP
transports that browsers cannot handle directly.

### Local mode does not require accounts

The open-source local product must work without user accounts, login, hosted
workspaces, billing, or cloud dependencies.

Local mode should keep data local by default. If the local runtime needs
protection, prefer runtime-local safeguards such as binding to `127.0.0.1` and
using a generated local token over introducing user management.

### Auth and user management are future SaaS concerns

Authentication, users, organizations, workspace membership, roles, billing,
remote trace storage, collaboration, and audit logs should be treated as hosted
product concerns.

The architecture should leave room for these concepts, but they should not be
implemented until SaaS or hosted collaboration becomes a concrete product
requirement.

### The SaaS frontend should not fork the product UI

The product should keep one primary frontend: `apps/inspector-web`.

`apps/inspector-web` should support different runtime targets:

- local mode: talks to a local Inspector Runtime
- hosted mode: may later talk to a hosted API/runtime

A separate marketing site or public documentation app may be introduced later,
but there should not be a separate SaaS product frontend that duplicates the
workbench UI.

### Local deployment should be container-friendly

The preferred local deployment direction is Docker Compose with focused services
for the web UI, Inspector Runtime, optional local persistence, and optional demo
MCP servers.

Docker Compose should improve repeatability for local and self-hosted usage, but
it should not force every MCP workflow into containers. Host-native `stdio` MCP
servers may require the Inspector Runtime to run directly on the host.

The UI should talk to the same runtime API regardless of whether the runtime is
running in Docker or directly on the host.

### The initial backend should use TypeScript and Node.js

The local Inspector Runtime should use TypeScript and Node.js for the first
implementation.

This keeps the frontend, runtime API, shared product models, MCP client wrapper,
and API contracts in one language while the product is still taking shape.

Python may be useful later for security analysis tooling or offline scanners.
Go or Rust may be useful later for gateway, proxy, or hardened connector
components. They should not be introduced into the MVP unless a concrete
requirement appears.

### Avoid early enterprise complexity

The project should not start with:

- multi-tenancy
- organization management
- billing
- enterprise RBAC
- policy engines
- cloud infrastructure
- Kubernetes-first orchestration
- hosted AI automation workflows

These can be considered later if the product earns that complexity.

### Security is a product differentiator

Security should be part of the product direction from the beginning, but it
should not slow down the MVP with enforcement systems.

Early security insights should be informative, educational, and non-blocking.
Future versions may add policies, enforcement, authentication layers, and
gateway protection.

### UX should be technical, fast, and focused

MCP Toolkit should feel clean, modern, fast, technical, and approachable.

Avoid enterprise dashboard overload, cluttered interfaces, generic AI
aesthetics, neon cyberpunk branding, and mascot-driven design.

The product should take inspiration from focused developer tools such as
Postman, Insomnia, Raycast, Linear, browser DevTools, trace viewers, and local
security review tools.

Brand writing should avoid startup buzzwords, AI hype wording, enterprise
corporate language, and unnecessary complexity.

### Future direction may include security and operations

Future capabilities may include:

- security insights
- saved requests
- trace timeline and trace diffing
- response comparison
- secret redaction
- risky tool detection
- trace export sanitization
- local audit reports
- auth helpers
- MCP gateway
- observability
- policy controls
- team workflows

These are long-term possibilities, not current requirements.

## Working Rule

When a product or architecture decision is unclear, prefer the simplest option
that supports the local MCP Toolkit workbench MVP.
