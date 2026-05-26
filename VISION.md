# Vision

MCP Toolkit aims to become a practical, open-source toolkit for developers
building with the MCP ecosystem.

MCP Toolkit lives under **dr-w**, a personal engineering and devtools lab rooted
in the `wahrheit` / `dr-wahrheit` identity. The brand should feel authentic,
technical, old-school internet, open-source oriented, and experimentation
friendly.

The goal is not to build another chatbot platform, prompt playground, low-code
AI builder, agent marketplace, or hype-driven AI wrapper. The goal is to build
useful developer infrastructure for understanding, debugging, securing, and
eventually operating MCP servers and agent workflows in production.

MCP Toolkit should feel closer to:

- Postman for MCP
- DevTools for MCP
- debugging and inspection tooling for MCP
- security visibility tooling for MCP
- eventually, Cloudflare/Auth0-style infrastructure for MCP access,
  governance, and trust

MCP Toolkit should not initially compete with runtime orchestration,
Kubernetes-first platforms, enterprise governance suites, or deployment
infrastructure. Those may be adjacent future areas, but the starting point is
developer tooling.

## First Product

The first product is **MCP Inspector**.

MCP Inspector should become a reliable developer tool for working with MCP
servers locally through a web-first interface. The product may later have a
hosted SaaS version, but SaaS is optional, not required for the product to be
useful.

The first phase is about adoption, trust, developer mindshare, and learning
real-world MCP pain points, not monetization.

## Core Direction

The long-term direction may include:

- inspection tools for MCP servers
- debugging workflows for requests and responses
- security insights for risky tool exposure
- auth helpers for common MCP deployments
- gateway capabilities for controlled access
- observability for production MCP usage
- governance and policy controls for agent ecosystems

These are future directions, not initial scope.

Security is a differentiator, but the initial product positioning should remain
inspection and debugging first.

## Initial Focus

The first goal is developer adoption.

The MVP should make it easy to:

- connect to an MCP server
- inspect exposed capabilities
- call tools
- replay requests

The MCP Inspector MVP should focus on:

- connection management for local/stdin and remote MCP servers
- saved or recent connections
- environment variable and auth header support
- inspection of tools, resources, prompts, schemas, and capabilities
- structured tool execution
- response viewing with formatted JSON and raw request/response details
- replay, request history, timelines, diffing, and import/export traces

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
