// FILE: qr.js
// Purpose: Generates short-lived bootstrap codes and prints a concise bridge-ready summary.
// Layer: CLI helper
// Exports: SHORT_PAIRING_CODE_ALPHABET, SHORT_PAIRING_CODE_LENGTH, createShortPairingCode, printQR
// Depends on: crypto

const { randomBytes } = require("crypto");

const SHORT_PAIRING_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SHORT_PAIRING_CODE_LENGTH = 10;

// Generates a short-lived human-friendly pairing token for reconnect flows.
function createShortPairingCode({
  length = SHORT_PAIRING_CODE_LENGTH,
  randomBytesImpl = randomBytes,
} = {}) {
  const resolvedLength = Number.isInteger(length) && length > 0 ? length : SHORT_PAIRING_CODE_LENGTH;
  const bytes = randomBytesImpl(resolvedLength);
  let code = "";
  for (let index = 0; index < resolvedLength; index += 1) {
    code += SHORT_PAIRING_CODE_ALPHABET[bytes[index] % SHORT_PAIRING_CODE_ALPHABET.length];
  }
  return code;
}

function normalizePairingSession(pairingSessionOrPayload) {
  if (pairingSessionOrPayload?.pairingPayload) {
    return {
      pairingPayload: pairingSessionOrPayload.pairingPayload,
      pairingCode: typeof pairingSessionOrPayload.pairingCode === "string"
        ? pairingSessionOrPayload.pairingCode.trim()
        : "",
    };
  }

  return {
    pairingPayload: pairingSessionOrPayload,
    pairingCode: "",
  };
}

function printQR(pairingSessionOrPayload) {
  const { pairingPayload, pairingCode } = normalizePairingSession(pairingSessionOrPayload);
  const relayUrl = typeof pairingPayload?.relay === "string" ? pairingPayload.relay : "unknown";
  const expiresAt = Number.isFinite(pairingPayload?.expiresAt)
    ? new Date(pairingPayload.expiresAt).toISOString()
    : "unknown";

  console.log("\n[koder] Bridge bootstrap is ready.");
  console.log(`[koder] Relay: ${relayUrl}`);
  console.log(`[koder] Expires: ${expiresAt}`);
  if (pairingCode) {
    console.log("[koder] A short recovery code is available in local state if a future client flow needs it.");
  }
  console.log("[koder] Open the self-hosted web client on the same host or IP to connect.\n");
}

module.exports = {
  SHORT_PAIRING_CODE_ALPHABET,
  SHORT_PAIRING_CODE_LENGTH,
  createShortPairingCode,
  printQR,
};
