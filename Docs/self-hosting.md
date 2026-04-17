# Self-Hosting Koder

This guide is for developers who clone the public GitHub repository and want to run Koder on infrastructure they control.

It covers two supported setups:

1. Local LAN access on your own machine
2. A self-hosted VPS relay that your bridge connects to over the internet

This document intentionally avoids any private hosted-service details. If you are using the public repo, assume you are bringing your own relay endpoint.

The public source tree is local-first and self-host friendly:

- there is no public production relay baked into the GitHub source
- local browser access should work out of the box with `./start.sh --ip <host>`
- internet-facing setups should pass their own relay URL explicitly with `REMODEX_RELAY`
- the browser connects directly to the live bridge on your host, then later reconnects can reuse that trust through the relay
- the built-in background daemon for trusted reconnect is currently macOS-only

## What Koder Self-Hosting Means

Koder is local-first.

That means:

- the bridge runs on your own Mac
- Codex runs on your own Mac
- git commands run on your own Mac
- your phone browser is the remote client
- the relay is only a transport layer for pairing, trusted-session resolve, and encrypted message forwarding

The relay does not run Codex and does not get your plaintext application payloads after the secure handshake completes.

## Option 1: Local LAN Setup

This is the easiest way to try the public repo. For regular use, a Tailscale or other stable private-network path is usually better than plain LAN routing.

### What you need

- a Mac with Codex CLI installed
- a phone browser that can reach your Mac over HTTPS
- both devices on the same local network

### Start everything locally

From the repo root:

```sh
git clone https://github.com/arwebSE/koder.git
cd koder
./start.sh --ip 192.168.1.10
```

What this does:

- starts a local relay on your machine
- starts the Koder bridge
- starts the local web client on port `5173` over HTTPS
- prints the browser URL and secure relay URL

Then:

1. Open the printed browser URL on your phone
2. If the browser warns that the local certificate is untrusted, trust it first.
3. Use the direct connect flow in the PWA.
4. Start a thread and send a message.
5. On later launches, trusted reconnect should restore the same Mac automatically.

### If your phone cannot reach the default hostname

Pass a hostname or IP address that the phone can actually reach:

```sh
./start.sh --ip 192.168.1.10
```

### Health check

By default the local relay listens on port `9000`.

From the same Mac:

```sh
curl http://127.0.0.1:9000/health
```

You should get:

```json
{"ok":true}
```

## Option 2: Self-Hosted VPS Relay

Use this when you want the bridge on your Mac to connect through a relay you run on a VPS.

This is also the best base for a Tailscale setup: the relay can live on a Mac, a mini server, or a VPS you control, as long as the browser client can reach it reliably.

### What runs where

On your VPS:

- the Koder relay

On your Mac:

- the Koder bridge
- Codex CLI / `codex app-server`

On your phone:

- the Koder PWA in the browser

### Start the relay on the VPS

From the public repo:

```sh
git clone https://github.com/arwebSE/koder.git
cd koder/relay
npm install
npm start
```

By default the relay listens on port `9000`.

### Verify the relay

On the VPS:

```sh
curl http://127.0.0.1:9000/health
```

You should get:

```json
{"ok":true}
```

### Put a reverse proxy in front of it

Expose the relay through a public `ws://` or `wss://` endpoint that forwards to the Node relay.

Two common patterns are:

- a dedicated subdomain, for example `wss://relay.example.com/relay`
- a shared-domain subpath, for example `wss://api.example.com/remodex/relay`

If you use a shared-domain subpath, make sure your reverse proxy strips the prefix before forwarding so the Node process still receives `/relay/...`.

### Point the bridge at your VPS relay

On the Mac that runs the bridge:

```sh
REMODEX_RELAY="wss://relay.example.com/relay" koder up
```

Or, if you are running from source:

```sh
cd phodex-bridge
npm install
REMODEX_RELAY="wss://relay.example.com/relay" npm start
```

After the first successful browser connection:

- the client stores the Mac as a trusted device
- the bridge keeps its local device identity
- the relay can resolve the current live session for that trusted Mac
- the app can reconnect without requiring a manual bootstrap every time

Today, that background-service path is built in for macOS. If you self-host against a non-macOS bridge, pairing and relay routing still work, but you must manage persistence/background service behavior yourself.

If you install the bridge from npm and do not use the local launcher, make sure you export `REMODEX_RELAY` before running `koder up`.

## Push Notifications

Managed push is optional.

For public self-hosting:

- you do not need push to use Koder
- local in-app and local-device flows can still work without it
- the relay keeps push endpoints disabled by default

Do not turn push on unless you are also ready to configure:

- a bridge-side `REMODEX_PUSH_SERVICE_URL`
- APNs credentials on the relay side
- your own operational setup for notification delivery

If you do nothing here, push stays off.

## Reverse Proxy Notes

If your relay sits behind Traefik, Nginx, or Caddy:

- forward WebSocket upgrades correctly
- forward the `/relay/...` path to the relay process
- only enable `REMODEX_TRUST_PROXY=true` when the proxy is trusted and sanitizes forwarded IP headers

## What Not to Commit

If you are self-hosting from the public repo, keep these things out of Git:

- your real relay hostname
- your private VPS IP addresses
- any APNs credentials
- any private package or App Store build defaults

The public repo should stay generic. Your actual deployment values belong in your own environment, build pipeline, or private config.

## Troubleshooting

### The bridge starts but the browser client cannot connect

Check:

- the relay is reachable from the phone
- your reverse proxy forwards WebSockets
- the bridge is using the correct `REMODEX_RELAY`
- the public endpoint uses `wss://` if you are going over the internet

### Local LAN access fails

Try a concrete LAN IP:

```sh
./start.sh --ip 192.168.1.10
```

If local LAN access still fails even though the relay health check works, prefer a Tailscale-reachable relay instead of continuing to rely on plain same-Wi-Fi routing.

### The relay health check works, but bootstrap still fails

That usually means one of these:

- the public path is wrong
- the reverse proxy is not forwarding upgrades
- the bridge is pointing at the wrong relay base URL

## Minimal Summary

If you cloned the public repo, the supported self-hosting story is:

- run the relay yourself
- prefer a relay path reachable from the browser client over Tailscale or another stable private network
- point the bridge at your relay with `REMODEX_RELAY`
- open the browser client on the same host or IP once to trust the Mac
- let reconnect reuse that trusted Mac over the same relay
- remember that the built-in daemon path is currently macOS-only
- keep private hostnames and credentials out of the public repo
