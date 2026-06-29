import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
// guard.test.mjs — safety regression tests for the community-token tooling.
//
// These tests lock in two invariants so a future change can't silently make the
// coins "live" or remove the irreversible-mainnet guard:
//   1. STATUS.md says NOT LIVE (machine-readable marker + human line).
//   2. mint.mjs refuses mainnet-beta without --i-understand-this-is-irreversible,
//      and refuses a non-interactive mainnet run even WITH the flag.
//   3. --help and --dry-run work with NO Solana network and NO installed deps.
//
// Run with: node --test   (NO network, NO node_modules required).
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const scriptsDir = join(here, '..');
const coinDir = join(scriptsDir, '..');
const mint = join(scriptsDir, 'mint.mjs');
const disclaimer = join(coinDir, 'DISCLAIMER.md');

// Run mint.mjs; return { code, stdout, stderr } without throwing on non-zero exit.
function runMint(args, { input } = {}) {
  try {
    const stdout = execFileSync('node', [mint, ...args], {
      cwd: scriptsDir,
      encoding: 'utf8',
      input: input ?? '',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

test('STATUS.md declares the tokens NOT LIVE (machine + human readable)', () => {
  const status = readFileSync(join(coinDir, 'STATUS.md'), 'utf8');
  // Machine-readable marker the site/marketing can parse.
  assert.match(status, /token-status:\s*NOT_LIVE/i, 'missing machine-readable NOT_LIVE marker');
  // Human-readable status lines for both coins.
  const liveCount = (status.match(/Status:\s*\*\*LIVE\*\*/gi) ?? []).length;
  assert.equal(liveCount, 0, 'STATUS.md must not declare any token LIVE');
  assert.match(status, /NOT LIVE/, 'human-readable NOT LIVE line missing');
});

test('mint.mjs --help exits 0 and documents the safety model', () => {
  const r = runMint(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /--dry-run/);
  assert.match(r.stdout, /--i-understand-this-is-irreversible/);
  assert.match(r.stdout, /NOT LIVE/);
});

test('mint.mjs REFUSES mainnet-beta without the irreversibility flag', () => {
  const r = runMint([
    '--network',
    'mainnet-beta',
    '--name',
    'GLAMFIRE',
    '--symbol',
    'GLAMFIRE',
    '--keypair',
    './nonexistent-keypair.json',
    '--uri',
    'https://glamworks.dev/glamfire.token.json',
    '--i-have-read',
    disclaimer,
  ]);
  assert.notEqual(r.code, 0, 'mainnet without the flag must be refused');
  assert.match(r.stderr, /IRREVERSIBLE/);
  assert.match(r.stderr, /--i-understand-this-is-irreversible/);
});

test('mint.mjs REFUSES non-interactive mainnet even WITH the flag', () => {
  // Even with the explicit flag, a piped (non-TTY) run must be refused — this is what
  // makes a CI/automated mainnet mint impossible.
  const r = runMint(
    [
      '--network',
      'mainnet-beta',
      '--name',
      'GLAMFIRE',
      '--symbol',
      'GLAMFIRE',
      '--keypair',
      './nonexistent-keypair.json',
      '--uri',
      'https://glamworks.dev/glamfire.token.json',
      '--i-have-read',
      disclaimer,
      '--i-understand-this-is-irreversible',
    ],
    { input: 'MINT GLAMFIRE ON MAINNET\n' },
  );
  assert.notEqual(r.code, 0, 'non-interactive mainnet must be refused');
  assert.match(r.stderr, /interactive|non-interactively/i);
});

test('mint.mjs --dry-run runs with no network/deps and prints the full tx plan', () => {
  const r = runMint([
    '--dry-run',
    '--name',
    'GLAMFIRE',
    '--symbol',
    'GLAMFIRE',
    '--supply',
    '1000000000',
    '--decimals',
    '9',
  ]);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /DRY RUN/);
  assert.match(r.stdout, /CreateMint/);
  assert.match(r.stdout, /REVOKE mint authority/);
  assert.match(r.stdout, /REVOKE freeze authority/);
  assert.match(r.stdout, /No transactions were sent/);
});
