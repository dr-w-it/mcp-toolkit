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

run_local() {
  require_cmd npm

  local runtime_pid=""
  local web_pid=""

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

main() {
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
