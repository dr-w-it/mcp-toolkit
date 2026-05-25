# Product Decisions

This document records early product decisions for MCP Toolkit.

## Decisions

### The first product is MCP Inspector

MCP Toolkit starts with **MCP Inspector**, a developer tool for inspecting and
debugging MCP servers.

### The project starts open-source-first

The initial project should be useful as open-source local tooling before any
hosted or commercial product is considered.

### Developer adoption comes before monetization

The first goal is adoption by MCP developers.

Monetization, billing, paid hosting, and enterprise packaging are not part of
the initial scope.

### The MVP must stay narrow

The MVP is limited to:

- connect
- inspect
- call
- replay

Anything outside this flow should be treated as future scope unless it is needed
to make the MVP work.

### Avoid early enterprise complexity

The project should not start with:

- multi-tenancy
- organization management
- billing
- enterprise RBAC
- policy engines
- cloud infrastructure

These can be considered later if the product earns that complexity.

### Future direction may include security and operations

Future capabilities may include:

- security insights
- auth helpers
- MCP gateway
- observability
- policy controls
- team workflows

These are long-term possibilities, not current requirements.

## Working Rule

When a product or architecture decision is unclear, prefer the simplest option
that supports the MCP Inspector MVP.
