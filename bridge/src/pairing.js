// FILE: pairing.js
// Purpose: Prints a concise bridge-ready summary for self-hosted bootstrap.
// Layer: CLI helper
// Exports: printPairingSessionSummary
// Depends on: none

function normalizePairingSession(pairingSessionOrPayload) {
  if (pairingSessionOrPayload?.pairingPayload) {
    return {
      pairingPayload: pairingSessionOrPayload.pairingPayload,
    };
  }

  return {
    pairingPayload: pairingSessionOrPayload,
  };
}

function printPairingSessionSummary(pairingSessionOrPayload) {
  const { pairingPayload } = normalizePairingSession(pairingSessionOrPayload);
  const relayUrl = typeof pairingPayload?.relay === "string" ? pairingPayload.relay : "unknown";
  const expiresAt = Number.isFinite(pairingPayload?.expiresAt)
    ? new Date(pairingPayload.expiresAt).toISOString()
    : "unknown";

  console.log("\n[koder] Bridge bootstrap is ready.");
  console.log(`[koder] Relay: ${relayUrl}`);
  console.log(`[koder] Expires: ${expiresAt}`);
  console.log("[koder] Open the self-hosted web client on the same host or IP to connect.\n");
}

module.exports = {
  printPairingSessionSummary,
};
