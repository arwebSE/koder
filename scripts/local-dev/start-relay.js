#!/usr/bin/env node

const { createRelayServer } = require(process.env.RELAY_SERVER_MODULE);

const host = process.env.RELAY_BIND_HOST || "0.0.0.0";
const port = Number.parseInt(process.env.RELAY_PORT || "9000", 10);
const { server } = createRelayServer();

server.listen(port, host, () => {
  console.log(`[relay] listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`[relay] shutting down (${signal})`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
