#!/usr/bin/env bash

# FILE: start.sh
# Purpose: Short one-command launcher for the local Koder relay, bridge, and web client.
# Layer: developer utility
# Exports: none
# Depends on: ./run-local-koder.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARGS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip)
      shift
      [[ $# -gt 0 ]] || {
        printf '[start] --ip requires a value\n' >&2
        exit 1
      }
      ARGS+=("--hostname" "$1")
      ;;
    *)
      ARGS+=("$1")
      ;;
  esac
  shift || true
done

exec "${SCRIPT_DIR}/run-local-koder.sh" "${ARGS[@]}"
