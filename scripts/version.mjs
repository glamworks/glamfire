#!/usr/bin/env node
// Single source of truth for the running version. Read by the CLI and release tooling
// so "the version is in the product's output" (SPEC §9) is always true and never drifts.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function getVersion() {
  // VERSION file is the authority; package.json is kept in sync by bump-version.mjs.
  return readFileSync(join(root, 'VERSION'), 'utf8').trim();
}

// Main-module check via pathToFileURL: naive `file://${argv[1]}` string-building
// never matches on Windows (backslashes, file:///D:/ drive form), which made
// `node scripts/version.mjs` print nothing there.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${getVersion()}\n`);
}
