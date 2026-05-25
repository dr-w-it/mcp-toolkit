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

MVP scope:

- connect to MCP servers
- inspect tools, resources, and prompts
- call tools
- replay requests

Out of scope for the MVP:

- billing
- hosted accounts
- enterprise access controls
- gateway infrastructure
- observability backend

## Phase 3: Developer Workflow Improvements

Potential additions:

- request history
- response viewer improvements
- schema explorer
- request timeline
- saved sessions
- response diffing

## Phase 4: Security Insights

Potential additions:

- risky tool detection
- missing auth visibility
- secret exposure warnings
- prompt injection indicators
- permission analysis

## Phase 5: Auth, Gateway, and Observability

Potential future direction:

- OAuth and JWT helpers
- API key helpers
- MCP gateway
- audit logs
- policy enforcement
- hosted observability
- team collaboration

These capabilities should be considered only after the inspector is useful as a
developer tool.
