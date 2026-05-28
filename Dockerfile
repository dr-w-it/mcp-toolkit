FROM node:24-bookworm-slim AS workspace

WORKDIR /workspace
ENV NODE_ENV=development

COPY package.json package-lock.json ./
COPY apps/inspector-runtime/package.json apps/inspector-runtime/package.json
COPY apps/inspector-web/package.json apps/inspector-web/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/mcp-client/package.json packages/mcp-client/package.json
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci

COPY . .

EXPOSE 5173 8787
