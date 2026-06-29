#!/usr/bin/env node
// Render the package-manager manifests for a release (issue #8).
//
//   node scripts/render-manifests.mjs            # uses dist-bin/SHA256SUMS.txt
//   node scripts/render-manifests.mjs --checksums <file> --out <dir>
//
// Reads the per-asset SHA-256 checksums produced by scripts/build-binaries.mjs and
// fills the templates under packaging/{homebrew,scoop,winget}/ — replacing
// __VERSION__, __RELEASE_DATE__, and each __SHA256_<asset>__ placeholder — writing
// the ready-to-publish manifests to dist/manifests/. The release workflow then
// pushes these to the tap / bucket / winget-pkgs repos. Fails loudly if any
// placeholder is left unresolved, so a release never ships a manifest with a
// literal __SHA256___ in it.

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : dflt;
};
const checksumsFile = arg('--checksums', join(repoRoot, 'dist-bin', 'SHA256SUMS.txt'));
const outDir = arg('--out', join(repoRoot, 'dist', 'manifests'));

// Parse "<sha>  <asset>" lines into { asset: sha }.
let checksums;
try {
  checksums = Object.fromEntries(
    readFileSync(checksumsFile, 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => {
        const [sha, asset] = l.trim().split(/\s+/);
        return [asset, sha];
      }),
  );
} catch {
  process.stderr.write(
    `render-manifests: no checksums at ${checksumsFile} — run \`bun scripts/build-binaries.mjs\` first.\n`,
  );
  process.exit(1);
}

const releaseDate = new Date().toISOString().slice(0, 10);

function render(text) {
  let out = text.replaceAll('__VERSION__', version).replaceAll('__RELEASE_DATE__', releaseDate);
  out = out.replace(/__SHA256_([^_]+(?:_[^_]+)*?)__/g, (_m, asset) => {
    const sha = checksums[asset];
    if (!sha)
      throw new Error(`render-manifests: no checksum for asset "${asset}" in ${checksumsFile}`);
    return sha;
  });
  if (out.includes('__SHA256_') || out.includes('__VERSION__')) {
    throw new Error('render-manifests: unresolved placeholder remains');
  }
  return out;
}

const templates = [
  ['homebrew', 'glamfire.rb'],
  ['scoop', 'glamfire.json'],
  ['winget', 'Glamworks.Glamfire.yaml'],
  ['winget', 'Glamworks.Glamfire.installer.yaml'],
  ['winget', 'Glamworks.Glamfire.locale.en-US.yaml'],
];

rmSync(outDir, { recursive: true, force: true });
for (const [channel, file] of templates) {
  const src = join(repoRoot, 'packaging', channel, file);
  const rendered = render(readFileSync(src, 'utf8'));
  const dest = join(outDir, channel, file);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, rendered);
  process.stdout.write(`render-manifests: ${channel}/${file}\n`);
}
process.stdout.write(`render-manifests: wrote rendered manifests for v${version} → ${outDir}\n`);
