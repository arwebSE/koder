// FILE: bridge.js
// Purpose: Runs Codex locally, bridges relay traffic, and coordinates desktop refreshes for Codex.app.
// Layer: CLI service
// Exports: startBridge
// Depends on: ws, crypto, os, ./qr, ./codex-desktop-refresher, ./codex-transport, ./rollout-watch

const WebSocket = require("ws");
const { randomBytes } = require("crypto");
const os = require("os");
const {
  CodexDesktopRefresher,
  readBridgeConfig,
} = require("./codex-desktop-refresher");
const { createCodexTransport } = require("./codex-transport");
const { createThreadRolloutActivityWatcher } = require("./rollout-watch");
const { printQR } = require("./qr");
const { rememberActiveThread } = require("./session-state");
const { handleDesktopRequest } = require("./desktop-handler");
const { handleGitRequest } = require("./git-handler");
const { handleThreadContextRequest } = require("./thread-context-handler");
const { handleWorkspaceRequest } = require("./workspace-handler");
const { createNotificationsHandler } = require("./notifications-handler");
const { createPushNotificationServiceClient } = require("./push-notification-service-client");
const { createPushNotificationTracker } = require("./push-notification-tracker");
const {
  loadOrCreateBridgeDeviceState,
  resolveBridgeRelaySession,
} = require("./secure-device-state");
const { createBridgeSecureTransport } = require("./secure-transport");
const { createRolloutLiveMirrorController } = require("./rollout-live-mirror");

const DEFAULT_RELAY_FLAP_WINDOW_MS = 60_000;
const DEFAULT_RELAY_FLAP_THRESHOLD = 8;
const DEFAULT_RELAY_FLAP_RECYCLE_COOLDOWN_MS = 5 * 60_000;
const DEFAULT_RELAY_FLAP_RUNTIME_QUIET_MS = 30_000;

function startBridge({
  config: explicitConfig = null,
  printPairingQr = true,
  onPairingPayload = null,
  onBridgeStatus = null,
  createCodexTransportImpl = createCodexTransport,
  now = () => Date.now(),
} = {}) {
  const config = explicitConfig || readBridgeConfig();
  const relayBaseUrl = config.relayUrl.replace(/\/+$/, "");
  if (!relayBaseUrl) {
    console.error("[remodex] No relay URL configured.");
    console.error("[remodex] In a source checkout, run ./run-local-remodex.sh or set REMODEX_RELAY.");
    process.exit(1);
  }

  let deviceState;
  try {
    deviceState = loadOrCreateBridgeDeviceState();
  } catch (error) {
    console.error(`[remodex] ${(error && error.message) || "Failed to load the saved bridge pairing state."}`);
    process.exit(1);
  }
  const relaySession = resolveBridgeRelaySession(deviceState);
  deviceState = relaySession.deviceState;
  const sessionId = relaySession.sessionId;
  const relaySessionUrl = `${relayBaseUrl}/${sessionId}`;
  const notificationSecret = randomBytes(24).toString("hex");
  const desktopRefresher = new CodexDesktopRefresher({
    enabled: config.refreshEnabled,
    debounceMs: config.refreshDebounceMs,
    refreshCommand: config.refreshCommand,
    bundleId: config.codexBundleId,
    appPath: config.codexAppPath,
  });
  const pushServiceClient = createPushNotificationServiceClient({
    baseUrl: config.pushServiceUrl,
    sessionId,
    notificationSecret,
  });
  const notificationsHandler = createNotificationsHandler({
    pushServiceClient,
  });
  const pushNotificationTracker = createPushNotificationTracker({
    sessionId,
    pushServiceClient,
    previewMaxChars: config.pushPreviewMaxChars,
  });

  // Keep the local Codex runtime alive across transient relay disconnects.
  let socket = null;
  let isShuttingDown = false;
  let reconnectAttempt = 0;
  let reconnectTimer = null;
  let lastConnectionStatus = null;
  let codexHandshakeState = config.codexEndpoint ? "warm" : "cold";
  const forwardedInitializeRequestIds = new Set();
  const secureTransport = createBridgeSecureTransport({
    sessionId,
    relayUrl: relayBaseUrl,
    deviceState,
    onTrustedPhoneUpdate(nextDeviceState) {
      deviceState = nextDeviceState;
      sendRelayRegistrationUpdate(nextDeviceState);
    },
  });
  // Keeps one stable sender identity across reconnects so buffered replay state
  // reflects what actually made it onto the current relay socket.
  function sendRelayWireMessage(wireMessage) {
    if (socket?.readyState !== WebSocket.OPEN) {
      return false;
    }

    socket.send(wireMessage);
    return true;
  }
  // Only the spawned local runtime needs rollout mirroring; a real endpoint
  // already provides the authoritative live stream for resumed threads.
  const rolloutLiveMirror = !config.codexEndpoint
    ? createRolloutLiveMirrorController({
      sendApplicationResponse,
    })
    : null;
  let contextUsageWatcher = null;
  let watchedContextUsageKey = null;
  let codex = null;
  let relayDisconnectTimestampsMs = [];
  let lastCodexRecycleAtMs = 0;
  let isRecyclingCodexRuntime = false;
  let lastCodexActivityAtMs = now();
  const activeTurnKeysByThreadId = new Map();
  publishBridgeStatus({
    state: "starting",
    connectionStatus: "starting",
    pid: process.pid,
    lastError: "",
  });

  function bindCodexTransport(transport) {
    transport.onError((error) => {
      if (transport !== codex) {
        return;
      }

      publishBridgeStatus({
        state: "error",
        connectionStatus: "error",
        pid: process.pid,
        lastError: error.message,
      });
      if (config.codexEndpoint) {
        console.error(`[remodex] Failed to connect to Codex endpoint: ${config.codexEndpoint}`);
      } else {
        console.error("[remodex] Failed to start `codex app-server`.");
        console.error(`[remodex] Launch command: ${transport.describe()}`);
        console.error("[remodex] Make sure the Codex CLI is installed and that the launcher works on this OS.");
      }
      console.error(error.message);
      process.exit(1);
    });

    transport.onMessage((message) => {
      if (transport !== codex) {
        return;
      }

      lastCodexActivityAtMs = now();
      trackTurnActivityFromMessage("codex", message);
      trackCodexHandshakeState(message);
      desktopRefresher.handleOutbound(message);
      pushNotificationTracker.handleOutbound(message);
      rememberThreadFromMessage("codex", message);
      secureTransport.queueOutboundApplicationMessage(message, sendRelayWireMessage);
    });

    transport.onClose(() => {
      if (transport !== codex) {
        return;
      }

      logConnectionStatus("disconnected");
      publishBridgeStatus({
        state: "stopped",
        connectionStatus: "disconnected",
        pid: process.pid,
        lastError: "",
      });
      isShuttingDown = true;
      clearReconnectTimer();
      stopContextUsageWatcher();
      rolloutLiveMirror?.stopAll();
      desktopRefresher.handleTransportReset();
      if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    });

    return transport;
  }

  // Recycles only the spawned local runtime after repeated relay flapping, leaving pairing/session state intact.
  function recycleCodexRuntimeIfNeeded(reason) {
    if (isShuttingDown || isRecyclingCodexRuntime) {
      return;
    }

    if (config.codexEndpoint || codex?.mode !== "spawn") {
      return;
    }

    const currentTimeMs = now();
    relayDisconnectTimestampsMs = trimRecentRelayDisconnects(relayDisconnectTimestampsMs, currentTimeMs);
    if (!shouldRecycleCodexRuntimeForRelayFlapping({
      disconnectTimestampsMs: relayDisconnectTimestampsMs,
      nowMs: currentTimeMs,
      lastRecycleAtMs: lastCodexRecycleAtMs,
      lastCodexActivityAtMs,
      activeTurnCount: activeTurnKeysByThreadId.size,
    })) {
      return;
    }

    isRecyclingCodexRuntime = true;
    lastCodexRecycleAtMs = currentTimeMs;
    relayDisconnectTimestampsMs = [];
    codexHandshakeState = "cold";
    forwardedInitializeRequestIds.clear();
    stopContextUsageWatcher();
    rolloutLiveMirror?.stopAll();
    console.error(`[remodex] relay reconnect storm detected; restarting local Codex runtime (${reason})`);

    try {
      const previousCodex = codex;
      codex = bindCodexTransport(createCodexTransportImpl({
        endpoint: config.codexEndpoint,
        env: process.env,
      }));
      previousCodex?.shutdown();
    } finally {
      isRecyclingCodexRuntime = false;
    }
  }

  codex = bindCodexTransport(createCodexTransportImpl({
    endpoint: config.codexEndpoint,
    env: process.env,
  }));

  function clearReconnectTimer() {
    if (!reconnectTimer) {
      return;
    }

    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  // Keeps npm start output compact by emitting only high-signal connection states.
  function logConnectionStatus(status) {
    if (lastConnectionStatus === status) {
      return;
    }

    lastConnectionStatus = status;
    publishBridgeStatus({
      state: "running",
      connectionStatus: status,
      pid: process.pid,
      lastError: "",
    });
    console.log(`[remodex] ${status}`);
  }

  // Retries the relay socket while preserving the active Codex process and session id.
  function scheduleRelayReconnect(closeCode) {
    if (isShuttingDown) {
      return;
    }

    if (closeCode === 4000 || closeCode === 4001) {
      logConnectionStatus("disconnected");
      shutdown(() => codex, () => socket, () => {
        isShuttingDown = true;
        clearReconnectTimer();
      });
      return;
    }

    if (reconnectTimer) {
      return;
    }

    reconnectAttempt += 1;
    const delayMs = Math.min(1_000 * reconnectAttempt, 5_000);
    logConnectionStatus("connecting");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectRelay();
    }, delayMs);
  }

  function connectRelay() {
    if (isShuttingDown) {
      return;
    }

    logConnectionStatus("connecting");
    const nextSocket = new WebSocket(relaySessionUrl, {
      // The relay uses this per-session secret to authenticate the first push registration.
      headers: {
        "x-role": "mac",
        "x-notification-secret": notificationSecret,
        ...buildMacRegistrationHeaders(deviceState),
      },
    });
    socket = nextSocket;

    nextSocket.on("open", () => {
      clearReconnectTimer();
      reconnectAttempt = 0;
      logConnectionStatus("connected");
      secureTransport.bindLiveSendWireMessage(sendRelayWireMessage);
      sendRelayRegistrationUpdate(deviceState);
    });

    nextSocket.on("message", (data) => {
      const message = typeof data === "string" ? data : data.toString("utf8");
      if (secureTransport.handleIncomingWireMessage(message, {
        sendControlMessage(controlMessage) {
          if (nextSocket.readyState === WebSocket.OPEN) {
            nextSocket.send(JSON.stringify(controlMessage));
          }
        },
        onApplicationMessage(plaintextMessage) {
          handleApplicationMessage(plaintextMessage);
        },
      })) {
        return;
      }
    });

    nextSocket.on("close", (code) => {
      logConnectionStatus("disconnected");
      const disconnectTimestampMs = now();
      relayDisconnectTimestampsMs = trimRecentRelayDisconnects(
        relayDisconnectTimestampsMs.concat(disconnectTimestampMs),
        disconnectTimestampMs
      );
      if (socket === nextSocket) {
        socket = null;
      }
      stopContextUsageWatcher();
      rolloutLiveMirror?.stopAll();
      desktopRefresher.handleTransportReset();
      recycleCodexRuntimeIfNeeded(`close=${code ?? "unknown"}`);
      scheduleRelayReconnect(code);
    });

    nextSocket.on("error", () => {
      logConnectionStatus("disconnected");
    });
  }

  const pairingPayload = secureTransport.createPairingPayload();
  onPairingPayload?.(pairingPayload);
  if (printPairingQr) {
    printQR(pairingPayload);
  }
  pushServiceClient.logUnavailable();
  connectRelay();

  process.on("SIGINT", () => shutdown(() => codex, () => socket, () => {
    isShuttingDown = true;
    clearReconnectTimer();
  }));
  process.on("SIGTERM", () => shutdown(() => codex, () => socket, () => {
    isShuttingDown = true;
    clearReconnectTimer();
  }));

  // Routes decrypted app payloads through the same bridge handlers as before.
  function handleApplicationMessage(rawMessage) {
    if (handleBridgeManagedHandshakeMessage(rawMessage)) {
      return;
    }
    if (handleThreadContextRequest(rawMessage, sendApplicationResponse)) {
      return;
    }
    if (handleWorkspaceRequest(rawMessage, sendApplicationResponse)) {
      return;
    }
    if (notificationsHandler.handleNotificationsRequest(rawMessage, sendApplicationResponse)) {
      return;
    }
    if (handleDesktopRequest(rawMessage, sendApplicationResponse, {
      bundleId: config.codexBundleId,
      appPath: config.codexAppPath,
    })) {
      return;
    }
    if (handleGitRequest(rawMessage, sendApplicationResponse)) {
      return;
    }
    trackTurnActivityFromMessage("phone", rawMessage);
    desktopRefresher.handleInbound(rawMessage);
    rolloutLiveMirror?.observeInbound(rawMessage);
    rememberThreadFromMessage("phone", rawMessage);
    codex.send(rawMessage);
  }

  // Encrypts bridge-generated responses instead of letting the relay see plaintext.
  function sendApplicationResponse(rawMessage) {
    secureTransport.queueOutboundApplicationMessage(rawMessage, sendRelayWireMessage);
  }

  function rememberThreadFromMessage(source, rawMessage) {
    const context = extractBridgeMessageContext(rawMessage);
    if (!context.threadId) {
      return;
    }

    rememberActiveThread(context.threadId, source);
    if (shouldStartContextUsageWatcher(context)) {
      ensureContextUsageWatcher(context);
    }
  }

  // Tracks known in-flight turns so relay-only churn does not kill healthy local work.
  function trackTurnActivityFromMessage(source, rawMessage) {
    const context = extractBridgeMessageContext(rawMessage);
    applyTrackedTurnActivity(activeTurnKeysByThreadId, { source, context });
  }

  // Mirrors CodexMonitor's persisted token_count fallback so the phone keeps
  // receiving context-window usage even when the runtime omits live thread usage.
  function ensureContextUsageWatcher({ threadId, turnId }) {
    const normalizedThreadId = readString(threadId);
    const normalizedTurnId = readString(turnId);
    if (!normalizedThreadId) {
      return;
    }

    const nextWatcherKey = `${normalizedThreadId}|${normalizedTurnId || "pending-turn"}`;
    if (watchedContextUsageKey === nextWatcherKey && contextUsageWatcher) {
      return;
    }

    stopContextUsageWatcher();
    watchedContextUsageKey = nextWatcherKey;
    contextUsageWatcher = createThreadRolloutActivityWatcher({
      threadId: normalizedThreadId,
      turnId: normalizedTurnId,
      onUsage: ({ threadId: usageThreadId, usage }) => {
        sendContextUsageNotification(usageThreadId, usage);
      },
      onIdle: () => {
        if (watchedContextUsageKey === nextWatcherKey) {
          stopContextUsageWatcher();
        }
      },
      onTimeout: () => {
        if (watchedContextUsageKey === nextWatcherKey) {
          stopContextUsageWatcher();
        }
      },
      onError: () => {
        if (watchedContextUsageKey === nextWatcherKey) {
          stopContextUsageWatcher();
        }
      },
    });
  }

  function stopContextUsageWatcher() {
    if (contextUsageWatcher) {
      contextUsageWatcher.stop();
    }

    contextUsageWatcher = null;
    watchedContextUsageKey = null;
  }

  function sendContextUsageNotification(threadId, usage) {
    if (!threadId || !usage) {
      return;
    }

    sendApplicationResponse(JSON.stringify({
      method: "thread/tokenUsage/updated",
      params: {
        threadId,
        usage,
      },
    }));
  }

  // The spawned/shared Codex app-server stays warm across phone reconnects.
  // When iPhone reconnects it sends initialize again, but forwarding that to the
  // already-initialized Codex transport only produces "Already initialized".
  function handleBridgeManagedHandshakeMessage(rawMessage) {
    let parsed = null;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      return false;
    }

    const method = typeof parsed?.method === "string" ? parsed.method.trim() : "";
    if (!method) {
      return false;
    }

    if (method === "initialize" && parsed.id != null) {
      if (codexHandshakeState !== "warm") {
        forwardedInitializeRequestIds.add(String(parsed.id));
        return false;
      }

      sendApplicationResponse(JSON.stringify({
        id: parsed.id,
        result: {
          bridgeManaged: true,
        },
      }));
      return true;
    }

    if (method === "initialized") {
      return codexHandshakeState === "warm";
    }

    return false;
  }

  // Learns whether the underlying Codex transport has already completed its own MCP handshake.
  function trackCodexHandshakeState(rawMessage) {
    let parsed = null;
    try {
      parsed = JSON.parse(rawMessage);
    } catch {
      return;
    }

    const responseId = parsed?.id;
    if (responseId == null) {
      return;
    }

    const responseKey = String(responseId);
    if (!forwardedInitializeRequestIds.has(responseKey)) {
      return;
    }

    forwardedInitializeRequestIds.delete(responseKey);

    if (parsed?.result != null) {
      codexHandshakeState = "warm";
      return;
    }

    const errorMessage = typeof parsed?.error?.message === "string"
      ? parsed.error.message.toLowerCase()
      : "";
    if (errorMessage.includes("already initialized")) {
      codexHandshakeState = "warm";
    }
  }

  function publishBridgeStatus(status) {
    onBridgeStatus?.(status);
  }

  // Refreshes the relay's trusted-mac index after the QR bootstrap locks in a phone identity.
  function sendRelayRegistrationUpdate(nextDeviceState) {
    deviceState = nextDeviceState;
    if (socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify({
      kind: "relayMacRegistration",
      registration: buildMacRegistration(nextDeviceState),
    }));
  }
}

// Registers the canonical Mac identity and the one trusted iPhone allowed for auto-resolve.
function buildMacRegistrationHeaders(deviceState) {
  const registration = buildMacRegistration(deviceState);
  const headers = {
    "x-mac-device-id": registration.macDeviceId,
    "x-mac-identity-public-key": registration.macIdentityPublicKey,
    "x-machine-name": registration.displayName,
  };
  if (registration.trustedPhoneDeviceId && registration.trustedPhonePublicKey) {
    headers["x-trusted-phone-device-id"] = registration.trustedPhoneDeviceId;
    headers["x-trusted-phone-public-key"] = registration.trustedPhonePublicKey;
  }
  return headers;
}

function buildMacRegistration(deviceState) {
  const trustedPhoneEntry = Object.entries(deviceState?.trustedPhones || {})[0] || null;
  return {
    macDeviceId: normalizeNonEmptyString(deviceState?.macDeviceId),
    macIdentityPublicKey: normalizeNonEmptyString(deviceState?.macIdentityPublicKey),
    displayName: normalizeNonEmptyString(os.hostname()),
    trustedPhoneDeviceId: normalizeNonEmptyString(trustedPhoneEntry?.[0]),
    trustedPhonePublicKey: normalizeNonEmptyString(trustedPhoneEntry?.[1]),
  };
}

function shutdown(getCodex, getSocket, beforeExit = () => {}) {
  beforeExit();

  const socket = getSocket();
  if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) {
    socket.close();
  }

  const codex = getCodex();
  codex.shutdown();

  setTimeout(() => process.exit(0), 100);
}

function trimRecentRelayDisconnects(
  disconnectTimestampsMs,
  nowMs,
  windowMs = DEFAULT_RELAY_FLAP_WINDOW_MS
) {
  return disconnectTimestampsMs.filter((timestampMs) => nowMs - timestampMs <= windowMs);
}

function shouldRecycleCodexRuntimeForRelayFlapping({
  disconnectTimestampsMs,
  nowMs,
  threshold = DEFAULT_RELAY_FLAP_THRESHOLD,
  windowMs = DEFAULT_RELAY_FLAP_WINDOW_MS,
  lastRecycleAtMs = 0,
  cooldownMs = DEFAULT_RELAY_FLAP_RECYCLE_COOLDOWN_MS,
  lastCodexActivityAtMs = 0,
  quietMs = DEFAULT_RELAY_FLAP_RUNTIME_QUIET_MS,
  activeTurnCount = 0,
}) {
  if (lastRecycleAtMs > 0 && nowMs - lastRecycleAtMs < cooldownMs) {
    return false;
  }

  if (activeTurnCount > 0) {
    return false;
  }

  if (lastCodexActivityAtMs > 0 && nowMs - lastCodexActivityAtMs < quietMs) {
    return false;
  }

  const recentDisconnectCount = trimRecentRelayDisconnects(
    disconnectTimestampsMs,
    nowMs,
    windowMs
  ).length;
  return recentDisconnectCount >= threshold;
}

function extractBridgeMessageContext(rawMessage) {
  let parsed = null;
  try {
    parsed = JSON.parse(rawMessage);
  } catch {
    return { method: "", threadId: null, turnId: null, statusType: "" };
  }

  const method = parsed?.method;
  const params = parsed?.params;
  const threadId = extractThreadId(method, params);
  const turnId = extractTurnId(method, params);
  const statusType = extractStatusType(method, params);

  return {
    method: typeof method === "string" ? method : "",
    threadId,
    turnId,
    statusType,
  };
}

function envelopeEventObject(params) {
  if (params?.event && typeof params.event === "object") {
    return params.event;
  }
  if (params?.msg && typeof params.msg === "object") {
    return params.msg;
  }
  return null;
}

function shouldStartContextUsageWatcher(context) {
  if (!context?.threadId) {
    return false;
  }

  return context.method === "turn/start"
    || context.method === "turn/started";
}

function extractThreadId(method, params) {
  if (
    method === "turn/start"
    || method === "turn/started"
    || method === "turn/completed"
    || method === "turn/failed"
    || method === "thread/start"
    || method === "thread/started"
    || isThreadStatusMethod(method)
  ) {
    const eventObject = envelopeEventObject(params);
    const candidates = [
      params?.threadId,
      params?.thread_id,
      params?.conversationId,
      params?.conversation_id,
      params?.thread?.id,
      params?.thread?.threadId,
      params?.thread?.thread_id,
      params?.turn?.threadId,
      params?.turn?.thread_id,
      eventObject?.threadId,
      eventObject?.thread_id,
      eventObject?.conversationId,
      eventObject?.conversation_id,
    ];

    for (const candidate of candidates) {
      const value = readString(candidate);
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function extractTurnId(method, params) {
  if (
    method === "turn/started"
    || method === "turn/completed"
    || method === "turn/failed"
    || isThreadStatusMethod(method)
  ) {
    const eventObject = envelopeEventObject(params);
    const candidates = [
      params?.turnId,
      params?.turn_id,
      params?.id,
      params?.turn?.id,
      params?.turn?.turnId,
      params?.turn?.turn_id,
      eventObject?.id,
      eventObject?.turnId,
      eventObject?.turn_id,
      eventObject?.turn?.id,
      eventObject?.turn?.turnId,
      eventObject?.turn?.turn_id,
    ];

    for (const candidate of candidates) {
      const value = readString(candidate);
      if (value) {
        return value;
      }
    }
  }

  return null;
}

// Shares one terminal-state mapping for runtime recycling so failed/stopped turns do not stay "active" forever.
function applyTrackedTurnActivity(activeTurnKeysByThreadId, { source, context }) {
  if (!context?.method) {
    return;
  }

  if (!context.threadId && !context.turnId) {
    return;
  }

  if (source === "phone" && context.method === "turn/start") {
    if (context.threadId) {
      activeTurnKeysByThreadId.set(context.threadId, context.threadId);
    }
    return;
  }

  if (source === "codex" && isTrackedTurnStartContext(context)) {
    if (context.threadId) {
      activeTurnKeysByThreadId.set(context.threadId, context.turnId || context.threadId);
    }
    return;
  }

  if (source === "codex" && isTrackedTurnTerminalContext(context)) {
    if (context.threadId) {
      activeTurnKeysByThreadId.delete(context.threadId);
      return;
    }

    for (const [threadId, trackedKey] of activeTurnKeysByThreadId.entries()) {
      if (trackedKey === context.turnId) {
        activeTurnKeysByThreadId.delete(threadId);
        break;
      }
    }
  }
}

function isTrackedTurnStartContext(context) {
  if (context.method === "turn/started") {
    return true;
  }

  if (!isThreadStatusMethod(context.method)) {
    return false;
  }

  return isActiveThreadStatusType(context.statusType);
}

function isTrackedTurnTerminalContext(context) {
  if (context.method === "turn/completed" || context.method === "turn/failed") {
    return true;
  }

  if (!isThreadStatusMethod(context.method)) {
    return false;
  }

  return isTerminalThreadStatusType(context.statusType);
}

function isThreadStatusMethod(method) {
  return method === "thread/status/changed"
    || method === "thread/status"
    || method === "codex/event/thread_status_changed";
}

function isActiveThreadStatusType(statusType) {
  return statusType === "active"
    || statusType === "running"
    || statusType === "processing"
    || statusType === "inprogress"
    || statusType === "started"
    || statusType === "pending";
}

function isTerminalThreadStatusType(statusType) {
  return statusType.includes("cancel")
    || statusType.includes("abort")
    || statusType.includes("interrupt")
    || statusType.includes("stop")
    || statusType.includes("fail")
    || statusType.includes("error")
    || statusType === "idle"
    || statusType === "notloaded"
    || statusType === "completed"
    || statusType === "done"
    || statusType === "finished";
}

function extractStatusType(method, params) {
  if (!isThreadStatusMethod(method)) {
    return "";
  }

  const eventObject = envelopeEventObject(params);
  const statusObject = objectValue(params?.status)
    || objectValue(eventObject?.status)
    || objectValue(params?.event?.status);
  const rawStatus = readString(
    statusObject?.type
      || statusObject?.statusType
      || statusObject?.status_type
      || params?.status
      || eventObject?.status
      || params?.event?.status
  );

  return normalizeStatusType(rawStatus);
}

function objectValue(value) {
  return value && typeof value === "object" ? value : null;
}

function normalizeStatusType(value) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/[\s_-]+/g, "")
    : "";
}

function readString(value) {
  return typeof value === "string" && value ? value : null;
}

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

module.exports = {
  applyTrackedTurnActivity,
  extractBridgeMessageContext,
  startBridge,
  shouldRecycleCodexRuntimeForRelayFlapping,
  trimRecentRelayDisconnects,
};
