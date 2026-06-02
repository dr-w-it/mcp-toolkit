# Vision

MCP Toolkit aims to become a practical, open-source, local-first workbench for
developers building with the MCP ecosystem.

MCP Toolkit lives under **dr-w**, a personal engineering and devtools lab rooted
in the `wahrheit` / `dr-wahrheit` identity. The brand should feel authentic,
technical, old-school internet, open-source oriented, and experimentation
friendly.

The goal is not to build another chatbot platform, prompt playground, low-code
AI builder, agent marketplace, or hype-driven AI wrapper. The goal is to build
useful developer infrastructure for understanding, debugging, replaying,
securing, and eventually operating MCP servers and agent workflows in
production.

MCP Toolkit should feel closer to:

- a local MCP workbench
- repeatable request and replay tooling for MCP
- trace and audit tooling for MCP interactions
- security review tooling for MCP
- eventually, Cloudflare/Auth0-style infrastructure for MCP access,
  governance, and trust

MCP Toolkit should not initially compete with runtime orchestration,
Kubernetes-first platforms, enterprise governance suites, or deployment
infrastructure. Those may be adjacent future areas, but the starting point is
developer tooling.

## Initial Product Direction

The initial product direction is **MCP Toolkit / MCP Workbench**.

MCP Toolkit should become a reliable developer tool for working with MCP
servers locally through a web-first interface. The product may later have a
hosted SaaS version, but SaaS is optional, not required for the product to be
useful.

Names like MCP Workbench, MCP Security Workbench, and MCP Replay / Trace tooling
fit the intended direction. "MCP Inspector" should not be the main public
product name unless it is clearly framed as a local/internal inspection module.

The first phase is about adoption, trust, developer mindshare, and learning
real-world MCP pain points, not monetization.

## Core Direction

The long-term direction may include:

- inspection capabilities for MCP servers
- debugging workflows for requests and responses
- saved requests and repeatable replay workflows
- trace timelines, trace diffing, and local audit artifacts
- security insights for risky tool exposure
- auth helpers for common MCP deployments
- gateway capabilities for controlled access
- observability for production MCP usage
- governance and policy controls for agent ecosystems

These are future directions, not initial scope.

Security is a differentiator, but the initial product positioning should remain
debugging, replay, traceability, and security review rather than generic
inspection.

## Initial Focus

The first goal is developer adoption.

The MVP should make it easy to:

- connect to an MCP server
- inspect exposed capabilities
- call tools
- save requests
- replay requests
- review local traces and security signals

The MCP Workbench MVP should focus on:

- connection management for local/stdin and remote MCP servers
- saved or recent connections
- environment variable and auth header support
- inspection of tools, resources, prompts, schemas, and capabilities
- structured tool execution
- response viewing with formatted JSON and raw request/response details
- saved requests, replay, request history, timelines, diffing, and
  import/export traces
- secret redaction, risky tool detection, trace export sanitization, and local
  audit reports

## Security Direction

Security is a major differentiator for MCP Toolkit.

The toolkit should eventually help developers identify:

- dangerous tools
- missing authentication
- over-permissive capabilities
- prompt injection vectors
- secret leakage risks
- insecure descriptions
- unsafe server exposure

Early security features should be informative, educational, and non-blocking.
Later they may evolve into policies, enforcement, authentication layers, and
gateway protection.

## Audience

Early adopters include:

- AI engineers
- agent developers
- MCP server maintainers
- AI infrastructure engineers
- DevOps engineers
- security engineers
- platform teams evaluating MCP workflows

Future audiences may include enterprise AI teams, internal tooling teams, and
companies adopting production agent workflows.

## Philosophy

Start open-source-first.

Keep the early product narrow and understandable.

Avoid:

- billing systems
- enterprise administration
- hosted platform complexity
- enterprise corporate language
- AI hype positioning
- unnecessary abstractions
- premature security product packaging

Focus on:

- useful developer workflows
- clear UX
- debuggability
- security awareness
- observability
- web-first local workflows
- incremental architecture
- trust through openness
- OSS-first adoption
