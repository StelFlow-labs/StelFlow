#!/usr/bin/env node
/**
 * Regenerate the TypeScript bindings from the deployed contract.
 *
 * `stellar contract bindings typescript --overwrite` wipes the output directory
 * and writes its own `package.json` — one that points `exports` at an unbuilt
 * `./dist/index.js` and pins its own copy of `@stellar/stellar-sdk`. Left alone,
 * that silently breaks the workspace every time bindings are regenerated: the
 * app resolves a second SDK copy, `u64`/`i128` stop resolving to `bigint`, and
 * the failure surfaces somewhere unrelated as "number is not assignable to
 * bigint".
 *
 * So this script generates, then rewrites the manifest deterministically:
 * consume the TypeScript source directly (no build step to forget) and take the
 * SDK from the app rather than bundling a second one.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "packages/stelflow-sdk");

const { testnet } = JSON.parse(
  readFileSync(join(root, "deployments.json"), "utf8"),
);

console.log(`Generating bindings for ${testnet.contractId}`);
execFileSync(
  "stellar",
  [
    "contract", "bindings", "typescript",
    "--network", "testnet",
    "--contract-id", testnet.contractId,
    "--output-dir", outDir,
    "--overwrite",
  ],
  { stdio: "inherit", cwd: root },
);

const manifest = {
  name: "stelflow-sdk",
  version: "0.1.0",
  private: true,
  type: "module",
  // Source, not dist: the app transpiles it via `transpilePackages`, so there is
  // no build step that can be skipped and no stale artifact to ship.
  main: "./src/index.ts",
  types: "./src/index.ts",
  exports: { ".": "./src/index.ts" },
  // A peer, deliberately. A direct dependency would install a second copy of the
  // SDK, and two copies mean two incompatible sets of `u64` / `i128` aliases.
  peerDependencies: { "@stellar/stellar-sdk": "*" },
};

writeFileSync(
  join(outDir, "package.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);

console.log("Rewrote packages/stelflow-sdk/package.json for the workspace.");
