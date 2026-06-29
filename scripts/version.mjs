#!/usr/bin/env node
// Single source of truth for the running version. Read by the CLI and release tooling
// so "the version is in the product's output" (SPEC §9) is always true and never drifts.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function getVersion() {
  // VERSION file is the authority; package.json is kept in sync by bump-version.mjs.
  return readFileSync(join(root, 'VERSION'), 'utf8').trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(`${getVersion()}\n`);
}
