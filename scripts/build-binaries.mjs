#!/usr/bin/env bun
// Build glamfire's standalone single-file binaries (issue #8, SPEC §7).
//
// Run with bun:  bun scripts/build-binaries.mjs  [--target=<id>] [--host-only]
//
// Produces self-contained `glam` executables (no pre-installed runtime needed) for
// every target in BINARY_TARGETS via `bun build --compile --target=...`, into
// dist-bin/, alongside a SHA256SUMS.txt. One host cross-compiles all targets
// (research/11-cross-platform-packaging.md). The version is inlined at build time
// so the binary reports the right version with no VERSION file on disk.
//
// After building, the binary that matches THIS host is actually executed
// (`glam --version`, `glam route`) so the build is verified the way a human runs it,
// not just produced.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BINARY_TARGETS,
  cliEntry,
  hostTargetId,
  inlineVersionPlugin,
  readVersion,
  repoRoot,
} from './packaging-common.mjs';

const outDir = join(repoRoot, 'dist-bin');
const version = readVersion();

const argv = process.argv.slice(2);
// --target=<id> (one) or --targets=<id,id,...> selects a subset; --host-only builds
// just the binary matching this runner. With none, every target is built.
const onlyTarget = argv.find((a) => a.startsWith('--target='))?.split('=')[1];
const targetList = argv
  .find((a) => a.startsWith('--targets='))
  ?.split('=')[1]
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const hostOnly = argv.includes('--host-only');
const host = hostTargetId();

let targets = BINARY_TARGETS;
if (targetList) targets = targets.filter((t) => targetList.includes(t.id));
if (onlyTarget) targets = targets.filter((t) => t.id === onlyTarget);
if (hostOnly) targets = targets.filter((t) => t.id === host);
if (targets.length === 0) {
  process.stderr.write('build-binaries: no targets selected\n');
  process.exit(1);
}

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const built = [];
const failed = [];

for (const t of targets) {
  const outfile = join(outDir, t.outName);
  process.stdout.write(`build-binaries: compiling ${t.id} → ${t.outName} … `);
  try {
    const result = await Bun.build({
      entrypoints: [cliEntry],
      compile: { target: t.bunTarget, outfile },
      minify: true,
      sourcemap: 'none',
      plugins: [inlineVersionPlugin(version)],
    });
    if (!result.success) {
      for (const m of result.logs) process.stderr.write(`\n  ${m}`);
      throw new Error('bundle failed');
    }
    const size = statSync(outfile).size;
    const sha = createHash('sha256').update(readFileSync(outfile)).digest('hex');
    built.push({ ...t, size, sha });
    process.stdout.write(`ok (${(size / 1024 / 1024).toFixed(1)} MB)\n`);
  } catch (err) {
    failed.push({ ...t, error: String(err?.message ?? err) });
    process.stdout.write(`FAILED — ${String(err?.message ?? err)}\n`);
  }
}

// --- checksums (SHA-256 of every produced asset) -----------------------------
if (built.length > 0) {
  const lines = built.map((b) => `${b.sha}  ${b.outName}`);
  writeFileSync(join(outDir, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
}

log('');
log(`glamfire ${version} — standalone binaries (dist-bin/)`);
for (const b of built) {
  log(`  ${b.id.padEnd(14)} ${(b.size / 1024 / 1024).toFixed(1).padStart(5)} MB  ${b.sha}`);
}
for (const f of failed) {
  log(`  ${f.id.padEnd(14)} FAILED — ${f.error}`);
}

// --- run the host binary the way a human would (real verification) -----------
const hostBin = built.find((b) => b.id === host);
if (hostBin) {
  const bin = join(outDir, hostBin.outName);
  log('');
  log(`build-binaries: running the host binary (${host}) to verify it actually works:`);
  const ver = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  log(`  $ ./${hostBin.outName} --version  →  ${ver}`);
  if (ver !== version) throw new Error(`host binary version ${ver} != VERSION ${version}`);
  const { FIREWORKS_API_KEY: _omit, ...env } = process.env;
  const route = execFileSync(bin, ['route', 'hi'], { encoding: 'utf8', env });
  const ok = /route decision/.test(route) && /glm-5p2/.test(route);
  log(
    `  $ ./${hostBin.outName} route "hi"  →  ${ok ? 'routed (center → glm-5p2)' : 'UNEXPECTED OUTPUT'}`,
  );
  if (!ok) throw new Error('host binary route output unexpected');
}

if (failed.length > 0 && built.length === 0) process.exit(1);
log('');
log(`build-binaries: ${built.length} built, ${failed.length} failed.`);
