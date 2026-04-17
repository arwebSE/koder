# AGENTS.md

This is the single repo-local agent guidance file for this project. Do not recreate `CLAUDE.md` or maintain parallel instruction files.

## Product Direction

- Koder is **web-first** now.
- `web/` is the active client direction.
- `phodex-bridge/` and `relay/` are the current operational core.
- Default assumption: the active product is fully self-hosted and free.

## Core Guardrails

- Keep the repo local-first and self-host friendly.
- Do not hardcode production relay domains or hosted-service assumptions.
- Self-hosted usage should remain fully usable and free.
- Keep bridge, relay, and web responsibilities separated.
- Shared logic belongs in services/coordinators, not duplicated across entrypoints or views.
- Avoid junk code, placeholder hacks, one-off workarounds, and low-signal docs.

## Documentation Guardrails

- Keep README honest about current maturity.
- Do not present the web client as less complete than it is.
- Present `koder` as the preferred CLI name.
- Mention `remodex` only where legacy package or compatibility details still matter.
- Use the current repo path `arwebSE/koder` in new docs when a clone URL is needed.

## Security and Privacy Guardrails

- Do not log live relay `sessionId` values or other bearer-like pairing identifiers in plaintext server logs.
- Prefer redaction, hashing, or abbreviated identifiers in logs.
- Keep private deploy values, credentials, and real hosted endpoints out of committed source.
- Preserve the self-hosted trust model: relay is transport, not runtime.

## Connection and Runtime Guardrails

- Prefer direct self-host browser access as the default client flow.
- Preserve secure reconnect behavior and local bridge bootstrap state.
- Avoid regressions in reconnect behavior or session recovery.
- Keep repo isolation by thread/project metadata and local `cwd`.
- Preserve local workspace and git execution on the user's machine.
- Keep desktop refresh optional and avoid making it the default assumption.

## Web Guardrails

If you touch `web/`:

- keep the UI distinctive and intentional, not generic dashboard filler
- prefer production-grade React/Vite/TypeScript changes
- keep self-host assumptions explicit in naming and architecture
- do not wire billing or hosted-service assumptions into the web client path

## Local Runbook

Bridge:

```sh
cd phodex-bridge
npm install
npm start
```

Relay:

```sh
cd relay
npm install
npm start
```

Web:

```sh
cd web
npm install
npm run dev
```
