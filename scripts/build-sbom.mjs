#!/usr/bin/env bun
// Generate a CycloneDX SBOM for a glamfire release (issue #8, SPEC §7/§8 supply chain).
//
// Run with bun OR node:  node scripts/build-sbom.mjs  [--out <file>]
//
// The shipped artifacts (npm bundle + standalone binaries) are self-contained: the
// CLI and its workspace packages plus their third-party deps are bundled into one
// file. This SBOM honestly enumerates that bundled closure — the workspace packages
// and the third-party runtime deps (zod, smol-toml), with versions read from the
// real installed packages, never hand-typed — so a release publishes a truthful
// component list (CycloneDX 1.5).

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = readFileSync(join(repoRoot, 'VERSION'), 'utf8').trim();

function pkgVersion(name, fromDir) {
  // Some packages (e.g. smol-toml) block `./package.json` in their exports map, so
  // resolve the package's main entry and walk up to its own manifest instead.
  const req = createRequire(join(repoRoot, fromDir, 'index.js'));
  let dir = dirname(req.resolve(name));
  for (let i = 0; i < 10; i += 1) {
    try {
      const m = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (m.name === name) return m.version;
    } catch {}
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`build-sbom: cannot resolve version for ${name}`);
}

// The runtime closure that ends up inside the `glamfire` bundle / `glam` binary.
const workspace = ['engine', 'adapters', 'router', 'config'].map((p) => {
  const m = JSON.parse(readFileSync(join(repoRoot, 'packages', p, 'package.json'), 'utf8'));
  return { name: m.name, version: m.version, kind: 'library' };
});

const thirdParty = [
  { name: 'zod', version: pkgVersion('zod', 'packages/config'), kind: 'library', license: 'MIT' },
  {
    name: 'smol-toml',
    version: pkgVersion('smol-toml', 'packages/config'),
    kind: 'library',
    license: 'BSD-3-Clause',
  },
];

const components = [...workspace, ...thirdParty].map((c) => ({
  type: c.kind,
  name: c.name,
  version: c.version,
  purl: `pkg:npm/${c.name.replace('@', '%40')}@${c.version}`,
  ...(c.license ? { licenses: [{ license: { id: c.license } }] } : {}),
}));

const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.5',
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    tools: [{ vendor: 'glamfire', name: 'build-sbom.mjs', version }],
    component: {
      type: 'application',
      name: 'glamfire',
      version,
      description: 'The open harness for the last mile of AI — the glam CLI.',
      licenses: [{ license: { id: 'Apache-2.0' } }],
      purl: `pkg:npm/glamfire@${version}`,
    },
  },
  components,
};

const outArg = process.argv.indexOf('--out');
const out = outArg !== -1 ? process.argv[outArg + 1] : join(repoRoot, `sbom-${version}.cdx.json`);
writeFileSync(out, `${JSON.stringify(sbom, null, 2)}\n`);
process.stdout.write(
  `build-sbom: wrote CycloneDX SBOM (${components.length} components) → ${out}\n`,
);
