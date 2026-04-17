#!/usr/bin/env bash

# FILE: run-local-bridge.sh
# Purpose: Starts a local relay plus the public bridge for OSS and self-host workflows.
# Layer: developer utility
# Exports: none
# Depends on: node, npm, curl, relay/server.js, bridge/bin/koder.js

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_SH="${ROOT_DIR}/scripts/local-dev/common.sh"
[[ -f "${COMMON_SH}" ]] || {
  printf '[run-local-bridge] Missing shared launcher helpers: %s\n' "${COMMON_SH}" >&2
  exit 1
}
# shellcheck source=./scripts/local-dev/common.sh
source "${COMMON_SH}"

BRIDGE_DIR="${ROOT_DIR}/bridge"
RELAY_DIR="${ROOT_DIR}/relay"
RELAY_SERVER_MODULE="${RELAY_DIR}/server.js"

RELAY_BIND_HOST="${RELAY_BIND_HOST:-0.0.0.0}"
RELAY_PORT="${RELAY_PORT:-9000}"
RELAY_HOSTNAME="${RELAY_HOSTNAME:-}"
RELAY_BRIDGE_HOST=""
RELAY_PID=""
BRIDGE_SERVICE_STARTED="false"

log() {
  echo "[run-local-bridge] $*"
}

die() {
  echo "[run-local-bridge] $*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./run-local-bridge.sh [options]

Options:
  --hostname HOSTNAME   Hostname or IP the browser client should use to reach this machine
  --bind-host HOST      Interface/address the local relay should listen on
  --port PORT           Relay port to listen on
  --help                Show this help text

Defaults:
  --bind-host           0.0.0.0
  --port                9000
  --hostname            macOS LocalHostName.local, then hostname, then localhost
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --hostname)
        require_value "--hostname" "$#" || die "--hostname requires a value."
        RELAY_HOSTNAME="$2"
        shift 2
        ;;
      --bind-host)
        require_value "--bind-host" "$#" || die "--bind-host requires a value."
        RELAY_BIND_HOST="$2"
        shift 2
        ;;
      --port)
        require_value "--port" "$#" || die "--port requires a value."
        RELAY_PORT="$2"
        shift 2
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        usage >&2
        die "Unknown argument: $1"
        ;;
    esac
  done
}

healthcheck_host() {
  case "${RELAY_BIND_HOST}" in
    ""|"0.0.0.0")
      printf '127.0.0.1\n'
      ;;
    "::")
      printf '[::1]\n'
      ;;
    *)
      printf '%s\n' "${RELAY_BIND_HOST}"
      ;;
  esac
}

cleanup() {
  if [[ "${BRIDGE_SERVICE_STARTED}" == "true" ]]; then
    (
      cd "${BRIDGE_DIR}"
      node ./bin/koder.js stop >/dev/null 2>&1 || true
    )
  fi

  if [[ -n "${RELAY_PID}" ]] && kill -0 "${RELAY_PID}" 2>/dev/null; then
    kill "${RELAY_PID}" 2>/dev/null || true
    wait "${RELAY_PID}" 2>/dev/null || true
  fi
}

ensure_prerequisites() {
  require_command node || die "Missing required command: node"
  require_command npm || die "Missing required command: npm"
  require_command curl || die "Missing required command: curl"
  ensure_node_version || die "Please use Node.js 18 or newer."
}

stop_repo_background_bridge_services() {
  stop_repo_launch_agent_services "${ROOT_DIR}" "[run-local-bridge]"
}

# Validates the advertised host before boot so the self-hosted browser flow points at this machine.
ensure_hostname_belongs_to_this_mac() {
  node "${ROOT_DIR}/scripts/local-dev/hostname-resolves-local.js" "${RELAY_HOSTNAME}" || die "The advertised hostname '${RELAY_HOSTNAME}' does not resolve back to this Mac.
Pass --hostname with a LAN hostname or IP address that points to this machine so the browser client can connect."
}

ensure_port_available() {
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"${RELAY_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    die "Port ${RELAY_PORT} is already in use. Stop the existing listener or rerun with --port."
  fi
}

wait_for_relay() {
  local attempt
  local probe_host

  probe_host="$(healthcheck_host)"
  for attempt in {1..20}; do
    if [[ -n "${RELAY_PID}" ]] && ! kill -0 "${RELAY_PID}" 2>/dev/null; then
      die "Relay process exited before becoming healthy."
    fi
    if curl --silent --fail "http://${probe_host}:${RELAY_PORT}/health" >/dev/null 2>&1; then
      return
    fi
    sleep 0.5
  done

  die "Relay did not become healthy on port ${RELAY_PORT}."
}

start_embedded_relay() {
  log "Starting relay on ${RELAY_BIND_HOST}:${RELAY_PORT}"

  RELAY_BIND_HOST="${RELAY_BIND_HOST}" \
  RELAY_PORT="${RELAY_PORT}" \
  RELAY_SERVER_MODULE="${RELAY_SERVER_MODULE}" \
  node "${ROOT_DIR}/scripts/local-dev/start-relay.js" &

  RELAY_PID=$!
}

print_summary() {
  cat <<EOF
[run-local-bridge] Configuration
  Relay bind host : ${RELAY_BIND_HOST}
  Relay port      : ${RELAY_PORT}
  Relay hostname  : ${RELAY_HOSTNAME}
  Bridge host     : ${RELAY_BRIDGE_HOST}
  Bridge relay    : ws://${RELAY_BRIDGE_HOST}:${RELAY_PORT}/relay
  Advertised URL  : ws://${RELAY_HOSTNAME}:${RELAY_PORT}/relay
EOF
}

start_bridge() {
  log "Starting bridge"
  cd "${BRIDGE_DIR}"
  # Keep the bridge on a local socket when the advertised hostname is only
  # reachable from other devices (for example a NetBird/Tailscale address).
  KODER_RELAY="ws://${RELAY_BRIDGE_HOST}:${RELAY_PORT}/relay" \
  KODER_ADVERTISED_RELAY="ws://${RELAY_HOSTNAME}:${RELAY_PORT}/relay" \
  node ./bin/koder.js run
}

hold_open() {
  log "Local relay is ready. Keep this terminal open while testing."
  log "Press Ctrl+C to stop both the local relay and the Koder bridge service."
  wait "${RELAY_PID}"
}

trap cleanup EXIT INT TERM

parse_args "$@"
if [[ -z "${RELAY_HOSTNAME}" ]]; then
  RELAY_HOSTNAME="$(default_hostname)"
fi
RELAY_BRIDGE_HOST="$(healthcheck_host)"

ensure_prerequisites
ensure_package_dependencies "${BRIDGE_DIR}" "[run-local-bridge]" || die "Failed to install bridge dependencies."
ensure_package_dependencies "${RELAY_DIR}" "[run-local-bridge]" || die "Failed to install relay dependencies."
stop_repo_background_bridge_services
ensure_hostname_belongs_to_this_mac
ensure_port_available
print_summary
start_embedded_relay
wait_for_relay
start_bridge
hold_open
