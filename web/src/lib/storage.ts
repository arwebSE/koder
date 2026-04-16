import { ed25519 } from "@noble/curves/ed25519";
import type {
  PersistedRelaySession,
  PersistedState,
  PhoneIdentityState,
  TrustedMacRecord,
} from "./types";

const STORAGE_KEY = "koder-web-state-v1";

export function loadPersistedState(): PersistedState {
  const fallback = createPersistedState();
  if (typeof window === "undefined" || !window.localStorage) {
    return fallback;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      savePersistedState(fallback);
      return fallback;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    const normalized = normalizePersistedState(parsed);
    savePersistedState(normalized);
    return normalized;
  } catch {
    savePersistedState(fallback);
    return fallback;
  }
}

export function savePersistedState(state: PersistedState): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function updatePersistedState(
  state: PersistedState,
  updater: (draft: PersistedState) => PersistedState
): PersistedState {
  const next = updater(structuredClonePolyfill(state));
  savePersistedState(next);
  return next;
}

export function createTrustedMacRecord(
  macDeviceId: string,
  macIdentityPublicKey: string,
  relayURL?: string | null,
  displayName?: string | null
): TrustedMacRecord {
  const timestamp = new Date().toISOString();

  return {
    macDeviceId,
    macIdentityPublicKey,
    relayURL: relayURL ?? null,
    displayName: displayName ?? null,
    lastPairedAt: timestamp,
    lastUsedAt: timestamp,
    lastResolvedAt: null,
    lastResolvedSessionId: null,
  };
}

export function createRelaySessionRecord(payload: {
  relayUrl: string;
  sessionId: string;
  macDeviceId: string;
  macIdentityPublicKey: string;
  shouldForceQRBootstrapOnNextHandshake: boolean;
}): PersistedRelaySession {
  return {
    relayUrl: payload.relayUrl,
    sessionId: payload.sessionId,
    macDeviceId: payload.macDeviceId,
    macIdentityPublicKey: payload.macIdentityPublicKey,
    protocolVersion: 1,
    lastAppliedBridgeOutboundSeq: 0,
    shouldForceQRBootstrapOnNextHandshake: payload.shouldForceQRBootstrapOnNextHandshake,
  };
}

function createPersistedState(): PersistedState {
  return {
    version: 1,
    phoneIdentityState: createPhoneIdentityState(),
    trustedMacRegistry: {},
    lastTrustedMacDeviceId: null,
    relaySession: null,
  };
}

function normalizePersistedState(value: Partial<PersistedState>): PersistedState {
  const phoneIdentityState = normalizePhoneIdentityState(value.phoneIdentityState);

  return {
    version: 1,
    phoneIdentityState,
    trustedMacRegistry: normalizeTrustedMacRegistry(value.trustedMacRegistry),
    lastTrustedMacDeviceId: typeof value.lastTrustedMacDeviceId === "string"
      ? value.lastTrustedMacDeviceId
      : null,
    relaySession: normalizeRelaySession(value.relaySession),
  };
}

function normalizePhoneIdentityState(value: Partial<PhoneIdentityState> | undefined): PhoneIdentityState {
  const phoneDeviceId = normalizeString(value?.phoneDeviceId);
  const phoneIdentityPrivateKey = normalizeString(value?.phoneIdentityPrivateKey);
  const phoneIdentityPublicKey = normalizeString(value?.phoneIdentityPublicKey);

  if (phoneDeviceId && phoneIdentityPrivateKey && phoneIdentityPublicKey) {
    return {
      phoneDeviceId,
      phoneIdentityPrivateKey,
      phoneIdentityPublicKey,
    };
  }

  return createPhoneIdentityState();
}

function createPhoneIdentityState(): PhoneIdentityState {
  const { secretKey, publicKey } = ed25519.keygen();

  return {
    phoneDeviceId: createRandomUUID(),
    phoneIdentityPrivateKey: bytesToBase64(secretKey),
    phoneIdentityPublicKey: bytesToBase64(publicKey),
  };
}

function normalizeTrustedMacRegistry(
  registry: PersistedState["trustedMacRegistry"] | undefined
): Record<string, TrustedMacRecord> {
  if (!registry || typeof registry !== "object") {
    return {};
  }

  const normalized: Record<string, TrustedMacRecord> = {};

  for (const [key, value] of Object.entries(registry)) {
    const macDeviceId = normalizeString(value?.macDeviceId) || normalizeString(key);
    const macIdentityPublicKey = normalizeString(value?.macIdentityPublicKey);
    if (!macDeviceId || !macIdentityPublicKey) {
      continue;
    }

    normalized[macDeviceId] = {
      macDeviceId,
      macIdentityPublicKey,
      lastPairedAt: normalizeTimestamp(value?.lastPairedAt),
      relayURL: normalizeNullableString(value?.relayURL),
      displayName: normalizeNullableString(value?.displayName),
      lastResolvedSessionId: normalizeNullableString(value?.lastResolvedSessionId),
      lastResolvedAt: normalizeNullableString(value?.lastResolvedAt),
      lastUsedAt: normalizeNullableString(value?.lastUsedAt),
    };
  }

  return normalized;
}

function normalizeRelaySession(value: Partial<PersistedRelaySession> | null | undefined): PersistedRelaySession | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const relayUrl = normalizeString(value.relayUrl);
  const sessionId = normalizeString(value.sessionId);
  const macDeviceId = normalizeString(value.macDeviceId);
  const macIdentityPublicKey = normalizeString(value.macIdentityPublicKey);
  if (!relayUrl || !sessionId || !macDeviceId || !macIdentityPublicKey) {
    return null;
  }

  return {
    relayUrl,
    sessionId,
    macDeviceId,
    macIdentityPublicKey,
    protocolVersion: Number.isInteger(value.protocolVersion) ? Number(value.protocolVersion) : 1,
    lastAppliedBridgeOutboundSeq: Number.isInteger(value.lastAppliedBridgeOutboundSeq)
      ? Number(value.lastAppliedBridgeOutboundSeq)
      : 0,
    shouldForceQRBootstrapOnNextHandshake: value.shouldForceQRBootstrapOnNextHandshake !== false,
  };
}

function structuredClonePolyfill<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeTimestamp(value: unknown): string {
  const normalized = normalizeString(value);
  return normalized || new Date().toISOString();
}

function createRandomUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
