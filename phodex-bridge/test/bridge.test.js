// FILE: bridge.test.js
// Purpose: Verifies relay-flapping detection only triggers Codex runtime recycling for sustained churn.
// Layer: Unit test
// Exports: node:test suite
// Depends on: node:test, node:assert/strict, ../src/bridge

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyTrackedTurnActivity,
  extractBridgeMessageContext,
  shouldRecycleCodexRuntimeForRelayFlapping,
  trimRecentRelayDisconnects,
} = require("../src/bridge");

test("trimRecentRelayDisconnects keeps only disconnects inside the active window", () => {
  assert.deepEqual(
    trimRecentRelayDisconnects([1_000, 40_000, 70_000], 90_000, 30_000),
    [70_000]
  );
});

test("shouldRecycleCodexRuntimeForRelayFlapping stays idle below the disconnect threshold", () => {
  const disconnects = [0, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000];
  assert.equal(
    shouldRecycleCodexRuntimeForRelayFlapping({
      disconnectTimestampsMs: disconnects,
      nowMs: 30_000,
    }),
    false
  );
});

test("shouldRecycleCodexRuntimeForRelayFlapping trips after repeated disconnects inside one minute", () => {
  const disconnects = [0, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000];
  assert.equal(
    shouldRecycleCodexRuntimeForRelayFlapping({
      disconnectTimestampsMs: disconnects,
      nowMs: 35_000,
      lastCodexActivityAtMs: 0,
    }),
    true
  );
});

test("shouldRecycleCodexRuntimeForRelayFlapping honors the recycle cooldown", () => {
  const disconnects = [0, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000];
  assert.equal(
    shouldRecycleCodexRuntimeForRelayFlapping({
      disconnectTimestampsMs: disconnects,
      nowMs: 36_000,
      lastRecycleAtMs: 35_000,
      lastCodexActivityAtMs: 0,
    }),
    false
  );
});

test("shouldRecycleCodexRuntimeForRelayFlapping stays idle while Codex is still active", () => {
  const disconnects = [0, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000];
  assert.equal(
    shouldRecycleCodexRuntimeForRelayFlapping({
      disconnectTimestampsMs: disconnects,
      nowMs: 35_000,
      lastCodexActivityAtMs: 20_000,
    }),
    false
  );
});

test("shouldRecycleCodexRuntimeForRelayFlapping stays idle while a turn is known to be running", () => {
  const disconnects = [0, 5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000];
  assert.equal(
    shouldRecycleCodexRuntimeForRelayFlapping({
      disconnectTimestampsMs: disconnects,
      nowMs: 35_000,
      lastCodexActivityAtMs: 0,
      activeTurnCount: 1,
    }),
    false
  );
});

test("applyTrackedTurnActivity clears failed turns so stale failures do not block runtime recycle", () => {
  const activeTurnKeysByThreadId = new Map([["thread-1", "turn-1"]]);

  applyTrackedTurnActivity(activeTurnKeysByThreadId, {
    source: "codex",
    context: {
      method: "turn/failed",
      turnId: "turn-1",
      threadId: "thread-1",
      statusType: "",
    },
  });

  assert.deepEqual([...activeTurnKeysByThreadId.entries()], []);
});

test("applyTrackedTurnActivity upgrades a pending thread key to the concrete turn id", () => {
  const activeTurnKeysByThreadId = new Map();

  applyTrackedTurnActivity(activeTurnKeysByThreadId, {
    source: "phone",
    context: {
      method: "turn/start",
      turnId: null,
      threadId: "thread-1",
      statusType: "",
    },
  });
  applyTrackedTurnActivity(activeTurnKeysByThreadId, {
    source: "codex",
    context: {
      method: "turn/started",
      turnId: "turn-1",
      threadId: "thread-1",
      statusType: "",
    },
  });

  assert.deepEqual([...activeTurnKeysByThreadId.entries()], [["thread-1", "turn-1"]]);
});

test("applyTrackedTurnActivity clears interrupted thread-status runs using the thread fallback key", () => {
  const activeTurnKeysByThreadId = new Map([["thread-1", "turn-1"]]);

  applyTrackedTurnActivity(activeTurnKeysByThreadId, {
    source: "codex",
    context: {
      method: "thread/status/changed",
      turnId: null,
      threadId: "thread-1",
      statusType: "interrupted",
    },
  });

  assert.deepEqual([...activeTurnKeysByThreadId.entries()], []);
});

test("applyTrackedTurnActivity clears both thread and turn keys when completion arrives", () => {
  const activeTurnKeysByThreadId = new Map([["thread-1", "turn-1"]]);

  applyTrackedTurnActivity(activeTurnKeysByThreadId, {
    source: "codex",
    context: {
      method: "turn/completed",
      turnId: "turn-1",
      threadId: "thread-1",
      statusType: "",
    },
  });

  assert.deepEqual([...activeTurnKeysByThreadId.entries()], []);
});

test("extractBridgeMessageContext keeps ids from turn/failed payloads", () => {
  assert.deepEqual(
    extractBridgeMessageContext(JSON.stringify({
      method: "turn/failed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
      },
    })),
    {
      method: "turn/failed",
      threadId: "thread-1",
      turnId: "turn-1",
      statusType: "",
    }
  );
});

test("extractBridgeMessageContext keeps ids from terminal thread/status payloads", () => {
  assert.deepEqual(
    extractBridgeMessageContext(JSON.stringify({
      method: "thread/status/changed",
      params: {
        threadId: "thread-1",
        turn: {
          id: "turn-1",
        },
        status: "interrupted",
      },
    })),
    {
      method: "thread/status/changed",
      threadId: "thread-1",
      turnId: "turn-1",
      statusType: "interrupted",
    }
  );
});

test("extractBridgeMessageContext reads status from msg envelopes too", () => {
  assert.deepEqual(
    extractBridgeMessageContext(JSON.stringify({
      method: "codex/event/thread_status_changed",
      params: {
        threadId: "thread-1",
        msg: {
          status: "running",
        },
      },
    })),
    {
      method: "codex/event/thread_status_changed",
      threadId: "thread-1",
      turnId: null,
      statusType: "running",
    }
  );
});
