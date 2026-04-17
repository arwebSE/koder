# Koder Web

This directory contains the standalone React + Vite + TypeScript web client for **Koder**.

## Local Run

For normal self-hosted testing, use the repo-root launcher so relay, bridge, and web all start together:

```sh
cd koder
./start.sh --ip 192.168.1.10
```

That prints the browser URL for your phone plus the secure relay URL and pairing/bootstrap details. The web client is now expected to run over HTTPS so mobile browsers can connect cleanly on the local network.

If you only want the web client by itself:

```sh
cd koder/web
npm install
npm run dev
```

Open the local Vite URL printed in the terminal, usually `http://localhost:5173`.

## Build

```sh
npm run build
npm run preview
```

## What is included

- React + Vite + TypeScript app shell
- PWA manifest and a lightweight service worker
- Koder-branded remote-coding UI
- Responsive layout for sidebar, workspace, and session rail
- Pairing/bootstrap flow, trusted reconnect, encrypted relay transport, threads, and send flow
