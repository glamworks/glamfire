#!/usr/bin/env bun
// Human-standard verification of the distributable artifacts (issue #8, SPEC §5/§10).
//
//   bun scripts/verify-artifacts.mjs
//
// Builds the real artifacts and DRIVES them the way a user would, then asserts the
// observed behavior:
//   1. npm package: pack the tarball, `npm i -g` it into an isolated prefix, run the
//      INSTALLED `glam --version` and `glam route "hi"` — not the repo source.
//   2. host binary: `bun build --compile` it, run `./glam --version` and `glam route`.
// Both must print the VERSION from the VERSION file and route a center task to GLM.
// Anything off → non-zero exit. No mocks; these are the real surfaces.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostTargetId, readVersion, repoRoot } from './packaging-common.mjs';

const version = readVersion();
const { FIREWORKS_API_KEY: _omit, ...noKeyEnv } = process.env;

let failures = 0;
function check(name, fn) {
  try {
    fn();
    process.stdout.write(`  ok  ${name}\n`);
  } catch (err) {
    failures += 1;
    process.stdout.write(`  XX  ${name}\n      ${err.message}\n`);
  }
}

process.stdout.write(`verify-artifacts: glamfire ${version} on ${hostTargetId()}\n\n`);

// --- 1. npm package: pack, global-install, run the installed binary ----------
process.stdout.write('npm package (packed + globally installed):\n');
const tmp = mkdtempSync(join(tmpdir(), 'glam-verify-npm-'));
try {
  execFileSync('bun', [join(repoRoot, 'scripts', 'build-npm.mjs'), '--pack'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });
  const tgz = join(repoRoot, `glamfire-${version}.tgz`);
  if (!existsSync(tgz)) throw new Error(`tarball not produced at ${tgz}`);
  const prefix = join(tmp, 'prefix');
  execFileSync('npm', ['install', '-g', '--prefix', prefix, tgz], { stdio: 'pipe' });
  const isWin = process.platform === 'win32';
  const bin = isWin ? join(prefix, 'glam.cmd') : join(prefix, 'bin', 'glam');

  check('installed `glam --version` prints VERSION', () => {
    const out = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
    if (out !== version) throw new Error(`got "${out}", want "${version}"`);
  });
  check('installed `glam route "hi"` routes a center task to GLM (offline)', () => {
    const out = execFileSync(bin, ['route', 'hi'], { encoding: 'utf8', env: noKeyEnv });
    if (!/route decision/.test(out)) throw new Error('no route decision block');
    if (!/glm-5p2/.test(out)) throw new Error('did not route to GLM 5.2');
  });
  check('installed `glam doctor` reads the package manifest (install check ok)', () => {
    let out = '';
    try {
      out = execFileSync(bin, ['doctor'], { encoding: 'utf8', env: noKeyEnv });
    } catch (err) {
      out = String(err.stdout ?? '');
    }
    if (!out.includes('glamfire install')) throw new Error('no install check line');
    if (/✗ glamfire install/.test(out)) throw new Error('install check failed in package');
  });
} finally {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(join(repoRoot, `glamfire-${version}.tgz`), { force: true });
}

// --- 2. host single-file binary: compile + run ------------------------------
process.stdout.write('\nstandalone host binary (bun --compile):\n');
execFileSync('bun', [join(repoRoot, 'scripts', 'build-binaries.mjs'), '--host-only'], {
  cwd: repoRoot,
  stdio: 'pipe',
});
const hostName = `glam-${hostTargetId()}${process.platform === 'win32' ? '.exe' : ''}`;
const hostBin = join(repoRoot, 'dist-bin', hostName);
check('compiled host binary exists', () => {
  if (!existsSync(hostBin)) throw new Error(`missing ${hostBin}`);
});
check('compiled `glam --version` prints VERSION', () => {
  const out = execFileSync(hostBin, ['--version'], { encoding: 'utf8' }).trim();
  if (out !== version) throw new Error(`got "${out}", want "${version}"`);
});
check('compiled `glam route "hi"` routes a center task to GLM (offline)', () => {
  const out = execFileSync(hostBin, ['route', 'hi'], { encoding: 'utf8', env: noKeyEnv });
  if (!/route decision/.test(out)) throw new Error('no route decision block');
  if (!/glm-5p2/.test(out)) throw new Error('did not route to GLM 5.2');
});

process.stdout.write(`\n${failures === 0 ? 'VERIFY PASS' : `VERIFY FAIL (${failures})`}\n`);
process.exit(failures === 0 ? 0 : 1);
