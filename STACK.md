# Stack

The stack is not finalized.

This repository should avoid framework commitments until implementation work
requires them. Early decisions should keep the desktop and web versions able to
share MCP and product logic.

## Current Commitments

- Use a monorepo layout.
- Keep user-facing applications in `apps/`.
- Keep shared logic in `packages/`.
- Keep documentation in `docs/`.
- Do not add billing, auth, cloud, or gateway code yet.

## Intended Packages

### `packages/mcp-client`

Wraps MCP communication behind a project-owned interface.

This package should eventually isolate protocol details from the applications.

### `packages/core`

Contains shared product and domain logic for MCP Inspector.

Examples may eventually include request history models, replay logic, inspection
state, and product-level types.

### `packages/ui`

Contains shared UI components once there is a real UI implementation.

This package should remain empty or minimal until the first app needs shared UI.

## Possible Future Choices

These are candidates, not decisions:

- TypeScript for shared product code
- React for UI applications
- Tauri for the desktop application
- Vite or Next.js for the web application

Choose frameworks only when implementation begins and the tradeoffs are clear.

## Principles

- Prefer simple tooling.
- Prefer shared logic over duplicated behavior.
- Avoid infrastructure before there is a product need.
- Avoid enterprise architecture during the MVP.
