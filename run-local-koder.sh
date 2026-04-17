#!/usr/bin/env bash

# FILE: run-local-koder.sh
# Purpose: Starts the local relay, bridge, and web client for one-command self-hosted testing.
# Layer: developer utility
# Exports: none
# Depends on: ./run-local-bridge.sh, web/package.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_SH="${SCRIPT_DIR}/scripts/local-dev/common.sh"
[[ -f "${COMMON_SH}" ]] || {
  printf '[run-local-koder] Missing shared launcher helpers: %s\n' "${COMMON_SH}" >&2
  exit 1
}
# shellcheck source=./scripts/local-dev/common.sh
source "${COMMON_SH}"

WEB_DIR="${SCRIPT_DIR}/web"
WEB_PORT="${WEB_PORT:-5173}"
WEB_LOG_FILE="${TMPDIR:-/tmp}/koder-web-dev.log"
WEB_CERT_DIR="${TMPDIR:-/tmp}/koder-web-certs"
WEB_CERT_KEY=""
WEB_CERT_CERT=""
RELAY_HOSTNAME=""
RELAY_PORT="${RELAY_PORT:-9000}"
KODER_PID=""
WEB_PID=""
FORWARDED_ARGS=()

cleanup() {
  if [[ -n "${WEB_PID}" ]] && kill -0 "${WEB_PID}" 2>/dev/null; then
    kill "${WEB_PID}" 2>/dev/null || true
    wait "${WEB_PID}" 2>/dev/null || true
  fi
  if [[ -n "${KODER_PID}" ]] && kill -0 "${KODER_PID}" 2>/dev/null; then
    kill "${KODER_PID}" 2>/dev/null || true
    wait "${KODER_PID}" 2>/dev/null || true
  fi
}

log() {
  printf '[run-local-koder] %s\n' "$*"
}

die() {
  log "$*"
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./run-local-koder.sh [options]

Options:
  --ip HOSTNAME         Alias for --hostname
  --hostname HOSTNAME   Hostname or IP the browser client should use to reach this machine
  --port PORT           Relay port to listen on
  --help                Show this help text

Environment:
  WEB_PORT              HTTPS dev-server port (default: 5173)
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --ip)
        require_value "--ip" "$#" || die "--ip requires a value"
        RELAY_HOSTNAME="$2"
        FORWARDED_ARGS+=("--hostname" "$2")
        shift 2
        ;;
      --hostname)
        require_value "--hostname" "$#" || die "--hostname requires a value"
        RELAY_HOSTNAME="$2"
        FORWARDED_ARGS+=("$1" "$2")
        shift 2
        ;;
      --port)
        require_value "--port" "$#" || die "--port requires a value"
        RELAY_PORT="$2"
        FORWARDED_ARGS+=("$1" "$2")
        shift 2
        ;;
      --help)
        usage
        exit 0
        ;;
      *)
        FORWARDED_ARGS+=("$1")
        shift
        ;;
    esac
  done
}

ensure_web_dependencies() {
  [[ -d "${WEB_DIR}" ]] || die "Missing web client directory: ${WEB_DIR}"
  ensure_package_dependencies "${WEB_DIR}" "[run-local-koder]" || die "Failed to install web dependencies."
}

ensure_web_port_available() {
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"${WEB_PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
    die "Web port ${WEB_PORT} is already in use. Stop the existing listener or set WEB_PORT."
  fi
}

is_ipv4_address() {
  [[ "$1" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]
}

ensure_local_https_certificate() {
  command -v openssl >/dev/null 2>&1 || die "openssl is required to generate the local HTTPS certificate."

  mkdir -p "${WEB_CERT_DIR}"
  WEB_CERT_KEY="${WEB_CERT_DIR}/koder-${RELAY_HOSTNAME}.key.pem"
  WEB_CERT_CERT="${WEB_CERT_DIR}/koder-${RELAY_HOSTNAME}.cert.pem"

  if [[ -f "${WEB_CERT_KEY}" && -f "${WEB_CERT_CERT}" ]]; then
    return
  fi

  local san_entry
  if is_ipv4_address "${RELAY_HOSTNAME}"; then
    san_entry="IP:${RELAY_HOSTNAME}"
  else
    san_entry="DNS:${RELAY_HOSTNAME}"
  fi

  local config_file
  config_file="${WEB_CERT_DIR}/koder-${RELAY_HOSTNAME}.openssl.cnf"
  cat > "${config_file}" <<EOF
[req]
default_bits = 2048
prompt = no
default_md = sha256
x509_extensions = req_ext
distinguished_name = dn

[dn]
CN = ${RELAY_HOSTNAME}
O = Koder Local Dev

[req_ext]
subjectAltName = ${san_entry}
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
EOF

  log "Generating local HTTPS certificate for ${RELAY_HOSTNAME}"
  openssl req \
    -x509 \
    -nodes \
    -newkey rsa:2048 \
    -days 7 \
    -keyout "${WEB_CERT_KEY}" \
    -out "${WEB_CERT_CERT}" \
    -config "${config_file}" >/dev/null 2>&1
}

start_web() {
  log "Starting web client on 0.0.0.0:${WEB_PORT} over HTTPS"
  : > "${WEB_LOG_FILE}"
  (
    cd "${WEB_DIR}"
    export KODER_HTTPS_KEY_PATH="${WEB_CERT_KEY}"
    export KODER_HTTPS_CERT_PATH="${WEB_CERT_CERT}"
    export KODER_RELAY_PROXY_TARGET="http://127.0.0.1:${RELAY_PORT}"
    export KODER_DISABLE_HMR="true"
    export VITE_KODER_ENABLE_SW="false"
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
    if curl --silent --fail --insecure "https://127.0.0.1:${WEB_PORT}" >/dev/null 2>&1; then
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
  Browser URL : https://${advertised_host}:${WEB_PORT}
  Relay URL   : wss://${advertised_host}:${WEB_PORT}/relay
  HTTPS cert  : ${WEB_CERT_CERT}
  Web log     : ${WEB_LOG_FILE}

If Safari marks the local certificate as untrusted, trust it first so the HTTPS page loads cleanly.
Open the Browser URL on your phone and use the direct self-host connect flow.
EOF
}

trap cleanup EXIT INT TERM

parse_args "$@"

if [[ -z "${RELAY_HOSTNAME}" ]]; then
  RELAY_HOSTNAME="$(default_hostname)"
fi

require_command node || die "Missing required command: node"
require_command npm || die "Missing required command: npm"
require_command curl || die "Missing required command: curl"
require_command openssl || die "openssl is required to generate the local HTTPS certificate."
ensure_node_version || die "Please use Node.js 18 or newer."

ensure_web_dependencies
ensure_web_port_available
ensure_local_https_certificate
start_web
wait_for_web

print_web_summary "${RELAY_HOSTNAME}"

"${SCRIPT_DIR}/run-local-bridge.sh" "${FORWARDED_ARGS[@]}" &
KODER_PID=$!
wait "${KODER_PID}"
