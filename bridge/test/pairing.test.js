// FILE: pairing.test.js
// Purpose: Verifies the bridge pairing summary prints the expected bootstrap details.
// Layer: Unit Test
// Exports: node:test suite
// Depends on: node:test, node:assert/strict, ../src/pairing

const test = require("node:test");
const assert = require("node:assert/strict");
const { printPairingSessionSummary } = require("../src/pairing");

test("printPairingSessionSummary emits relay and expiry details", () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (message = "") => {
    lines.push(String(message));
  };

  try {
    printPairingSessionSummary({
      pairingPayload: {
        relay: "wss://relay.example/relay",
        expiresAt: Date.UTC(2026, 0, 2, 3, 4, 5),
      },
    });
  } finally {
    console.log = originalLog;
  }

  const output = lines.join("\n");
  assert.match(output, /Bridge bootstrap is ready/);
  assert.match(output, /wss:\/\/relay\.example\/relay/);
  assert.match(output, /2026-01-02T03:04:05\.000Z/);
  assert.doesNotMatch(output, /recovery code/i);
});
