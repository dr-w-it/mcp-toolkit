#!/usr/bin/env bash
set -euo pipefail

# Root-level development helpers for MCP Toolkit.
# Keep commands as thin wrappers around the repository's existing npm scripts.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<EOF
Usage: ./dev.sh <command> [args]

Shortcuts:
  server                 Start the inspector web dev server
  runtime                Start the local inspector runtime
  local                  Start web and runtime together
  remote:mcp             Start the remote HTTP/SSE MCP test server
  docker:up              Start the local Docker Compose stack

Setup:
  deps                   Install npm workspace dependencies

Web:
  web:dev                Start the inspector web dev server
  web:build              Build the inspector web app
  web:typecheck          Typecheck the inspector web app

Runtime:
  runtime:dev            Start the local inspector runtime in watch mode
  runtime:build          Build the local inspector runtime
  runtime:start          Start the built local inspector runtime
  runtime:typecheck      Typecheck the local inspector runtime

MCP test servers:
  remote:mcp             Start the SDK HTTP/SSE MCP test server on port 3000

Packages:
  packages:build         Build shared packages
  packages:typecheck     Typecheck shared packages

Validation:
  build                  Build packages and apps
  typecheck              Typecheck packages and apps
  check                  Run typecheck and build

Examples:
  ./dev.sh deps
  ./dev.sh server
  ./dev.sh runtime
  ./dev.sh local
  ./dev.sh remote:mcp
  ./dev.sh docker:up
  ./dev.sh docker:up -d
  ./dev.sh check
EOF
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing dependency: $1" >&2
    exit 1
  }
}

run_npm() {
  require_cmd npm
  (cd "$ROOT_DIR" && npm "$@")
}

run_workspace() {
  local workspace="$1"
  shift
  run_npm run "$@" --workspace "$workspace"
}

load_env() {
  local line
  local key
  local value

  if [[ -f "$ROOT_DIR/.env" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      [[ "$line" =~ ^[[:space:]]*$ ]] && continue
      [[ "$line" =~ ^[[:space:]]*# ]] && continue
      [[ "$line" == *"="* ]] || continue

      key="${line%%=*}"
      value="${line#*=}"
      key="${key//[[:space:]]/}"

      if [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ && -z "${!key+x}" ]]; then
        export "$key=$value"
      fi
    done < "$ROOT_DIR/.env"
  fi
}

is_port_open() {
  local host="$1"
  local port="$2"

  bash -c ':</dev/tcp/$1/$2' _ "$host" "$port" >/dev/null 2>&1
}

assert_port_available() {
  local label="$1"
  local host="$2"
  local port="$3"

  if is_port_open "$host" "$port"; then
    cat >&2 <<EOF
Cannot start ${label}: ${host}:${port} is already in use.

Use different ports, for example:

  INSPECTOR_WEB_PORT=15000 INSPECTOR_RUNTIME_PORT=18787 VITE_INSPECTOR_RUNTIME_URL=http://127.0.0.1:18787 ./dev.sh local

EOF
    exit 1
  fi
}

run_local() {
  require_cmd npm

  local web_host="${INSPECTOR_WEB_HOST:-127.0.0.1}"
  local web_port="${INSPECTOR_WEB_PORT:-5000}"
  local runtime_host="${INSPECTOR_RUNTIME_HOST:-127.0.0.1}"
  local runtime_port="${INSPECTOR_RUNTIME_PORT:-8787}"

  local runtime_pid=""
  local web_pid=""

  assert_port_available "inspector web" "$web_host" "$web_port"
  assert_port_available "inspector runtime" "$runtime_host" "$runtime_port"

  export INSPECTOR_WEB_HOST="$web_host"
  export INSPECTOR_WEB_PORT="$web_port"
  export INSPECTOR_RUNTIME_HOST="$runtime_host"
  export INSPECTOR_RUNTIME_PORT="$runtime_port"
  export VITE_INSPECTOR_RUNTIME_URL="${VITE_INSPECTOR_RUNTIME_URL:-http://${runtime_host}:${runtime_port}}"

  cleanup() {
    if [[ -n "$web_pid" ]]; then
      kill "$web_pid" >/dev/null 2>&1 || true
    fi
    if [[ -n "$runtime_pid" ]]; then
      kill "$runtime_pid" >/dev/null 2>&1 || true
    fi
  }

  trap cleanup EXIT INT TERM

  (
    cd "$ROOT_DIR"
    npm run dev --workspace @dr-w/inspector-runtime
  ) &
  runtime_pid="$!"

  (
    cd "$ROOT_DIR"
    npm run dev --workspace @dr-w/inspector-web
  ) &
  web_pid="$!"

  wait "$runtime_pid" "$web_pid"
}

run_docker() {
  require_cmd docker
  (cd "$ROOT_DIR" && docker compose up --build "$@")
}

run_remote_mcp_test_server() {
  require_cmd node

  local server_path="$ROOT_DIR/node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/sseAndStreamableHttpCompatibleServer.js"

  if [[ ! -f "$server_path" ]]; then
    echo "Missing MCP SDK test server. Run ./dev.sh deps first." >&2
    exit 1
  fi

  node "$server_path"
}

main() {
  load_env

  case "${1:-}" in
    deps)
      run_npm ci
      ;;
    server|web:dev)
      run_workspace @dr-w/inspector-web dev
      ;;
    runtime|runtime:dev)
      run_workspace @dr-w/inspector-runtime dev
      ;;
    local)
      run_local
      ;;
    remote:mcp)
      run_remote_mcp_test_server
      ;;
    docker:up)
      shift
      run_docker "$@"
      ;;
    web:build)
      run_workspace @dr-w/inspector-web build
      ;;
    web:typecheck)
      run_workspace @dr-w/inspector-web typecheck
      ;;
    runtime:build)
      run_workspace @dr-w/inspector-runtime build
      ;;
    runtime:start)
      run_workspace @dr-w/inspector-runtime start
      ;;
    runtime:typecheck)
      run_workspace @dr-w/inspector-runtime typecheck
      ;;
    packages:build)
      run_npm run build:packages
      ;;
    packages:typecheck)
      run_npm run typecheck:packages
      ;;
    build)
      run_npm run build
      ;;
    typecheck)
      run_npm run typecheck
      ;;
    check)
      run_npm run typecheck
      run_npm run build
      ;;
    -h|--help|"")
      usage
      ;;
    *)
      echo "Unknown command: ${1}" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
