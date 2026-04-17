#!/usr/bin/env bash

# Shared helpers for local Koder/Koder dev launchers.

require_value() {
  local flag_name="$1"
  local remaining_args="$2"
  [[ "${remaining_args}" -ge 2 ]] || {
    printf '%s requires a value.\n' "${flag_name}" >&2
    return 1
  }
}

default_hostname() {
  if command -v scutil >/dev/null 2>&1; then
    local local_host_name
    local_host_name="$(scutil --get LocalHostName 2>/dev/null || true)"
    local_host_name="${local_host_name//[$'\r\n']}"
    if [[ -n "${local_host_name}" ]]; then
      printf '%s.local\n' "${local_host_name}"
      return
    fi
  fi

  local host_name
  host_name="$(hostname 2>/dev/null || true)"
  host_name="${host_name//[$'\r\n']}"
  if [[ -n "${host_name}" ]]; then
    printf '%s\n' "${host_name}"
    return
  fi

  printf 'localhost\n'
}

require_command() {
  local command_name="$1"
  command -v "${command_name}" >/dev/null 2>&1
}

ensure_node_version() {
  local node_version
  local node_major

  node_version="$(node -p 'process.versions.node' 2>/dev/null || true)"
  [[ -n "${node_version}" ]] || return 1

  node_major="${node_version%%.*}"
  [[ "${node_major}" =~ ^[0-9]+$ ]] || return 1

  (( node_major >= 18 ))
}

ensure_package_dependencies() {
  local package_dir="$1"
  local log_prefix="$2"

  [[ -f "${package_dir}/package.json" ]] || {
    printf '%s Missing package.json in %s\n' "${log_prefix}" "${package_dir}" >&2
    return 1
  }

  if [[ -d "${package_dir}/node_modules" ]]; then
    return
  fi

  printf '%s Installing dependencies in %s\n' "${log_prefix}" "${package_dir}"
  (
    cd "${package_dir}"
    npm install
  )
}

stop_repo_launch_agent_services() {
  local repo_root="$1"
  local log_prefix="$2"

  [[ "$(uname -s)" == "Darwin" ]] || return 0
  [[ -n "${HOME:-}" ]] || return 0

  local launch_agents_dir="${HOME}/Library/LaunchAgents"
  [[ -d "${launch_agents_dir}" ]] || return 0

  local uid
  uid="$(id -u 2>/dev/null || true)"
  [[ -n "${uid}" ]] || return 0

  local stopped_any="false"
  local plist_path
  for plist_path in "${launch_agents_dir}"/com.*.bridge.plist; do
    [[ -f "${plist_path}" ]] || continue
    if ! grep -Fq "${repo_root}" "${plist_path}" 2>/dev/null; then
      continue
    fi
    if ! grep -Fq "run-service" "${plist_path}" 2>/dev/null; then
      continue
    fi

    launchctl bootout "gui/${uid}" "${plist_path}" >/dev/null 2>&1 || true
    stopped_any="true"
  done

  if [[ "${stopped_any}" == "true" ]]; then
    printf '%s Stopped repo-owned background bridge services before foreground launch.\n' "${log_prefix}"
  fi
}
