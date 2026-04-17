#!/usr/bin/env node

const dns = require("node:dns");
const os = require("node:os");

const hostname = process.argv[2];

if (!hostname) {
  process.stderr.write("hostname is required\n");
  process.exit(1);
}

const localAddresses = new Set(["127.0.0.1", "::1"]);
for (const addresses of Object.values(os.networkInterfaces())) {
  for (const address of addresses || []) {
    if (address && typeof address.address === "string" && address.address) {
      localAddresses.add(address.address);
    }
  }
}

dns.lookup(hostname, { all: true }, (error, records) => {
  if (error || !Array.isArray(records) || records.length === 0) {
    process.exit(1);
    return;
  }

  const isLocal = records.some((record) => localAddresses.has(record.address));
  process.exit(isLocal ? 0 : 1);
});
