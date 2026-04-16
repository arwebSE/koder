# Koder Product Spec

**Status:** Working direction
**Date:** April 16, 2026

## Goal

Turn the current fork-derived product into **Koder**, a standalone product centered on a **web app / PWA client** instead of an iOS app.

The product split is:

- **Koder OSS**: self-hosted bridge, relay, and web client are free
- **Koder Cloud**: hosted web client and hosted infrastructure are monetized

This keeps the core local-first workflow open while charging only for managed hosting and convenience.

## Product Decisions

### Platform

- The primary client will be a **React web app** with **PWA support**.
- We are **not** treating iOS App Store distribution as the main path.
- The existing Swift iOS app becomes a temporary reference implementation, not the long-term product.

### Monetization Boundary

- **Self-hosted usage is 100% free**.
- **Hosted usage is monetized** because it consumes Koder-operated infrastructure.
- Monetization must live in the **hosted client/service layer**, not in the open protocol.

### Pricing

Initial hosted pricing target:

- **Free cloud tier**: usable, but interrupted
- **Koder Cloud Pro**: **39 SEK/month**
- annual plan can be added later after launch

## Product Tiers

### Koder OSS

Included for free:

- self-hosted relay
- self-hosted bridge
- self-hosted web client
- local-first pairing to the user's own machine
- open protocol for transport and encrypted session handling

Rules:

- no hosted billing checks
- no annoyware
- no artificial blocking

### Koder Cloud Free

Included:

- hosted web client
- hosted relay and reconnect conveniences
- enough access to evaluate the product

Limits:

- interruptive upgrade prompts
- lower usage limits than paid hosted tier
- convenience features may be capped

### Koder Cloud Pro

Included:

- hosted web client without interruptions
- hosted relay/reconnect path
- better hosted limits and convenience defaults

## Annoyware Rules

Annoyware applies to **hosted free users only**.

It does **not** apply to:

- self-hosted users
- local-only users
- paid hosted users

### Allowed annoyware

- first-party Koder interstitial popup
- visible close timer before dismiss
- upgrade banners in the app shell
- modest hosted cooldowns or lower hosted limits

### Not allowed

- third-party ad networks
- tracking-heavy ad SDKs
- popups during an active run
- blocking access to self-hosted flows

### Initial popup behavior

- trigger after a limited number of hosted free sends, not on every action
- close timer: **5-8 seconds**
- frequency cap: at most **1 per hour** and **3 per day**
- never show while a turn is actively running
- show only after a completed action or before a new hosted free send

### Suggested hosted free limits

- slower send cadence than paid hosted tier
- lower queue/subagent limits in hosted free
- hosted reconnect/push convenience may be reduced or disabled

## Technical Boundary

### Keep and reuse

Keep these core pieces as the reusable backend/protocol base:

- Node bridge in `phodex-bridge`
- Node relay in `relay`
- secure pairing and encrypted transport
- Codex session transport and local workspace/git handling

### Replace

Replace the Swift client with:

- React frontend
- PWA installability
- web onboarding, pairing, chat timeline, composer, thread list, and settings

### Monetization placement

Hosted monetization should be enforced by the hosted web app and hosted backend config, not by the open bridge protocol.

Decision rule:

- if using **Koder-operated hosted origin/infrastructure**, monetization logic is active
- if using **custom/self-hosted backend**, monetization logic is off

## Initial Architecture Direction

### OSS stack

- `bridge`: local Node bridge running near Codex
- `relay`: self-hostable websocket relay
- `web`: self-hostable React/PWA client

### Cloud stack

- hosted `web` client
- hosted relay
- hosted auth/session layer if needed
- hosted monetization flags and usage policy

## Migration Direction

### Phase 1

- define Koder branding and naming
- stop planning around iOS-first distribution
- keep existing bridge/relay as the foundation
- write the web client against the existing protocol where possible

### Phase 2

- build the hosted/self-hosted aware web client
- add configuration switch for custom backend/relay
- move monetization checks into hosted web/backend paths

### Phase 3

- remove the current hard-paywall approach
- introduce hosted-only annoyware and hosted tier rules
- update docs and legal text to reflect OSS vs Cloud split

## Repo Work Order

This is the recommended implementation order:

1. Rebrand product-facing docs and package/app naming to **Koder**
2. Add a new web client workspace
3. Preserve bridge and relay compatibility while building the web client
4. Isolate current subscription logic so it no longer defines core access policy
5. Implement hosted-only feature flags and annoyware behavior
6. Update legal/docs copy for self-hosted free vs hosted paid

## Immediate Build Constraints

- self-hosted mode must remain fully usable without billing
- hosted monetization must not break the open-source/self-host path
- do not introduce ad-network dependencies
- do not hard-block the product for free hosted users
- keep the bridge/relay protocol as stable as practical during the client rewrite

## Success Criteria

Koder is on the right path when all of the following are true:

- a user can self-host the stack and use it for free
- a user can use a hosted Koder web client with a free tier
- hosted free users see mild, controlled interruption instead of a hard paywall
- paid hosted users get a clean uninterrupted experience
- the product no longer depends on App Store distribution to exist
