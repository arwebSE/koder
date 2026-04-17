# Koder Product Spec

**Status:** Current direction  
**Date:** April 17, 2026

## Goal

Build **Koder** as a fully self-hosted, web-first remote client for Codex.

The product direction is now simple:

- the browser PWA is the primary client
- the Node bridge and relay stay as the operational core
- the repo remains local-first and self-hosted
- the project is free to use in self-hosted mode

## Product Rules

- No hosted paid tier is in scope right now.
- No annoyware is in scope right now.
- No billing logic belongs in the bridge, relay, or web client.
- The relay is transport, not a hosted control plane.
- Codex, git, and workspace execution stay on the user's machine.

## Platform

- Primary client: React + Vite + TypeScript PWA in `web/`
- Runtime core: `phodex-bridge/` and `relay/`

## Access Model

- Open the PWA from the same host or IP that is running `./run-local-koder.sh`
- The browser attaches directly to the live self-hosted bridge on that host
- Trusted reconnect can still exist as a convenience, but browser-first direct bootstrap is the default flow

## Near-Term Priorities

1. Keep the self-hosted PWA stable on phone-sized screens
2. Reduce transcript/session payload size and keep scrolling responsive
3. Tighten direct-host bootstrap and client approval/recovery flows
4. Continue removing stale pairing and legacy naming assumptions from the bridge UX and docs

## Non-Goals

- App Store-first delivery
- Hosted monetization infrastructure
- Product locks on self-hosted users
