#!/usr/bin/env node
// Bump semver INCLUDING the patch (third) number, keep VERSION + package.json in sync.
// Usage: node scripts/bump-version.mjs [major|minor|patch]   (default: patch)
// Prints the new version. Commit/push/tag is done by the caller (see CLAUDE.md release rule).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kind = (process.argv[2] ?? 'patch').toLowerCase();
if (!['major', 'minor', 'patch'].includes(kind)) {
  console.error(`bump-version: unknown bump "${kind}" (want major|minor|patch)`);
  process.exit(1);
}

const cur = readFileSync(join(root, 'VERSION'), 'utf8').trim();
const m = cur.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!m) {
  console.error(`bump-version: VERSION "${cur}" is not semver x.y.z`);
  process.exit(1);
}
let [maj, min, pat] = [Number(m[1]), Number(m[2]), Number(m[3])];
if (kind === 'major') { maj += 1; min = 0; pat = 0; }
else if (kind === 'minor') { min += 1; pat = 0; }
else { pat += 1; }
const next = `${maj}.${min}.${pat}`;

writeFileSync(join(root, 'VERSION'), `${next}\n`);
const pkgPath = join(root, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

process.stdout.write(`${next}\n`);
