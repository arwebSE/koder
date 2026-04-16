#!/usr/bin/env bash

# FILE: run-local-koder.sh
# Purpose: Starts the local relay, bridge, and web client for one-command self-hosted testing.
# Layer: developer utility
# Exports: none
# Depends on: ./run-local-remodex.sh, web/package.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="${SCRIPT_DIR}/web"
WEB_PORT="${WEB_PORT:-5173}"
WEB_LOG_FILE="${TMPDIR:-/tmp}/koder-web-dev.log"
RELAY_HOSTNAME=""
RELAY_PORT="${RELAY_PORT:-9000}"
REMODEX_PID=""
WEB_PID=""

cleanup() {
  if [[ -n "${WEB_PID}" ]] && kill -0 "${WEB_PID}" 2>/dev/null; then
    kill "${WEB_PID}" 2>/dev/null || true
    wait "${WEB_PID}" 2>/dev/null || true
  fi
  if [[ -n "${REMODEX_PID}" ]] && kill -0 "${REMODEX_PID}" 2>/dev/null; then
    kill "${REMODEX_PID}" 2>/dev/null || true
    wait "${REMODEX_PID}" 2>/dev/null || true
  fi
}

log() {
  printf '[run-local-koder] %s\n' "$*"
}

die() {
  log "$*"
  exit 1
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --hostname)
        shift
        [[ $# -gt 0 ]] || die "--hostname requires a value"
        RELAY_HOSTNAME="$1"
        ;;
      --port)
        shift
        [[ $# -gt 0 ]] || die "--port requires a value"
        RELAY_PORT="$1"
        ;;
    esac
    shift || true
  done
}

default_hostname() {
  local host_name
  host_name="$(hostname 2>/dev/null || true)"
  if [[ -n "${host_name}" ]]; then
    printf '%s' "${host_name}"
    return
  fi
  printf 'localhost'
}

ensure_web_dependencies() {
  [[ -d "${WEB_DIR}" ]] || die "Missing web client directory: ${WEB_DIR}"
  if [[ ! -d "${WEB_DIR}/node_modules" ]]; then
    log "Installing web dependencies in ${WEB_DIR}"
    (cd "${WEB_DIR}" && npm install)
  fi
}

ensure_web_port_available() {
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"${WEB_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    die "Web port ${WEB_PORT} is already in use. Stop the existing listener or set WEB_PORT."
  fi
}

start_web() {
  log "Starting web client on 0.0.0.0:${WEB_PORT}"
  : > "${WEB_LOG_FILE}"
  (
    cd "${WEB_DIR}"
    npm run dev -- --host 0.0.0.0 --port "${WEB_PORT}" --strictPort
  ) >"${WEB_LOG_FILE}" 2>&1 &
  WEB_PID=$!
}

wait_for_web() {
  local attempt
  for attempt in {1..40}; do
    if [[ -n "${WEB_PID}" ]] && ! kill -0 "${WEB_PID}" 2>/dev/null; then
      tail -n 40 "${WEB_LOG_FILE}" >&2 || true
      die "Web client exited before becoming ready."
    fi
    if curl --silent --fail "http://127.0.0.1:${WEB_PORT}" >/dev/null 2>&1; then
      return
    fi
    sleep 0.5
  done

  tail -n 40 "${WEB_LOG_FILE}" >&2 || true
  die "Web client did not become ready on port ${WEB_PORT}."
}

print_web_summary() {
  local advertised_host="$1"
  cat <<EOF
[run-local-koder] Web client ready
  Browser URL : http://${advertised_host}:${WEB_PORT}
  Relay URL   : ws://${advertised_host}:${2}/relay
  Web log     : ${WEB_LOG_FILE}

Open the Browser URL on your phone, paste the Relay URL + pairing code shown below, then tap "Connect to Mac".
EOF
}

trap cleanup EXIT INT TERM

parse_args "$@"

if [[ -z "${RELAY_HOSTNAME}" ]]; then
  RELAY_HOSTNAME="$(default_hostname)"
fi

ensure_web_dependencies
ensure_web_port_available
start_web
wait_for_web

print_web_summary "${RELAY_HOSTNAME}" "${RELAY_PORT}"

"${SCRIPT_DIR}/run-local-remodex.sh" "$@" &
REMODEX_PID=$!
wait "${REMODEX_PID}"
