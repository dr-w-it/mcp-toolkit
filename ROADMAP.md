# Roadmap

This roadmap is intentionally high level. It should guide sequencing without
locking the project into premature implementation details.

## Phase 1: Repository Foundation

Goal: establish project direction and structure.

- define the product vision
- document early product decisions
- create the app and package layout
- avoid framework commitments until implementation begins

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

Out of scope for the MVP:

- billing
- hosted accounts
- mandatory SaaS usage
- enterprise access controls
- gateway infrastructure
- observability backend
- Kubernetes-first runtime orchestration
- hosted AI automation workflows

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
