#!/usr/bin/env bun
// Build the self-contained `glamfire` npm package (issue #8, SPEC §7).
//
// Run with bun:  bun scripts/build-npm.mjs  [--pack]
//
// Bundles the `glam` CLI together with its workspace dependencies
// (@glamfire/engine|adapters|router|config) and their npm deps (zod, smol-toml)
// into ONE file with no `workspace:*` specifiers and no native modules — so
// `npm i -g glamfire` works for any Node >= 22 user with zero extra resolution.
// The published package name is `glamfire`; it provides the `glam` bin.
//
// Layout of the staged package (dist/npm/):
//   package.json                 the real, publishable manifest (no deps)
//   dist/cli/src/glam.mjs        the single bundled CLI (with shebang, +x)
//   README.md  LICENSE  NOTICE   shipped docs
//
// The bundle is placed 3 dirs deep (dist/cli/src) on purpose: the CLI's `glam
// doctor` resolves its install check via `<pkgRoot>/package.json` (three levels up
// from the bundle), so inside the installed package that check reads the package's
// own manifest and passes. The version is inlined at build time (see
// packaging-common.mjs), so no runtime VERSION file is needed.

import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { cliEntry, inlineVersionPlugin, readVersion, repoRoot } from './packaging-common.mjs';

const PKG_NAME = 'glamfire';
const BIN_NAME = 'glam';
const BIN_REL = 'dist/cli/src/glam.mjs';

const stage = join(repoRoot, 'dist', 'npm');
const version = readVersion();

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

// --- clean stage -------------------------------------------------------------
rmSync(stage, { recursive: true, force: true });
mkdirSync(join(stage, 'dist', 'cli', 'src'), { recursive: true });

// --- bundle ------------------------------------------------------------------
log(`build-npm: bundling ${PKG_NAME}@${version} (glam) for Node >= 22 …`);
const result = await Bun.build({
  entrypoints: [cliEntry],
  target: 'node',
  format: 'esm',
  minify: true,
  sourcemap: 'none',
  plugins: [inlineVersionPlugin(version)],
});
if (!result.success) {
  for (const m of result.logs) process.stderr.write(`${m}\n`);
  throw new Error('build-npm: bundle failed');
}

const artifact = result.outputs.find((o) => o.kind === 'entry-point') ?? result.outputs[0];
let code = await artifact.text();
// npm `bin` targets must be directly executable on POSIX: ensure a shebang.
const SHEBANG = '#!/usr/bin/env node\n';
if (!code.startsWith('#!')) code = SHEBANG + code;
const outFile = join(stage, BIN_REL);
writeFileSync(outFile, code);
chmodSync(outFile, 0o755);

// --- publishable manifest (no workspace:* deps, fully self-contained) --------
const rootPkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
const manifest = {
  name: PKG_NAME,
  version,
  description:
    'The open, model-agnostic harness for the last mile of AI — the glam CLI. ' +
    'Own your context, route each task to the cheapest capable model.',
  license: 'Apache-2.0',
  type: 'module',
  bin: { [BIN_NAME]: BIN_REL },
  files: ['dist', 'README.md', 'LICENSE', 'NOTICE'],
  engines: { node: '>=22' },
  homepage: rootPkg.homepage,
  repository: rootPkg.repository,
  bugs: rootPkg.bugs,
  keywords: rootPkg.keywords,
  publishConfig: { access: 'public', provenance: true },
};
writeFileSync(join(stage, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);

// --- shipped docs ------------------------------------------------------------
for (const f of ['README.md', 'LICENSE', 'NOTICE']) {
  const src = join(repoRoot, f);
  if (existsSync(src)) cpSync(src, join(stage, f));
}

const bytes = readFileSync(outFile).length;
log(`build-npm: wrote ${outFile} (${(bytes / 1024).toFixed(0)} KB bundled)`);
log(`build-npm: staged package at ${stage}`);

// --- optional: produce the publishable tarball -------------------------------
if (process.argv.includes('--pack')) {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('npm', ['pack', '--pack-destination', repoRoot], {
    cwd: stage,
    encoding: 'utf8',
  });
  const tarball = out.trim().split('\n').pop();
  log(`build-npm: packed tarball → ${join(repoRoot, tarball)}`);
}

log('build-npm: done.');
