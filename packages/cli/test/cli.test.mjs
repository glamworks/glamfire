// Regression tests for the glam CLI's ergonomics + hardening sweep. Two layers:
//  1. unit tests of the pure helpers (suggest, useColor, detectInstall) — these
//     lock in the compiled-binary doctor fix and the color policy;
//  2. the REAL CLI spawned as a child process — exit codes, "did you mean",
//     numeric-flag validation, NO_COLOR/FORCE_COLOR, and the `| head` EPIPE fix,
//     asserted on real stdout/stderr, no mocks.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createAnthropicAdapter,
  createFireworksGlmAdapter,
  resolveAnthropicConfig,
  resolveFireworksConfig,
} from '@glamfire/adapters';
import { describe, expect, it } from 'vitest';
import { detectInstall, isStandaloneBuild } from '../src/doctor.mjs';
import { exitCodeForStatus, providerModelHeader } from '../src/run.mjs';
import { suggest, useColor } from '../src/ui.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cli = join(here, '..', 'src', 'index.mjs');
const repoRoot = join(here, '..', '..', '..');

/** Spawn the real CLI; never throws — returns { status, stdout, stderr }. */
function glam(args, opts = {}) {
  const r = spawnSync('node', [cli, ...args], { encoding: 'utf8', ...opts });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('ui.suggest — "did you mean" for typos', () => {
  const commands = ['run', 'route', 'config', 'doctor', 'version', 'help'];
  it('suggests the nearest command within 2 edits', () => {
    expect(suggest('rout', commands)).toBe('route');
    expect(suggest('confg', commands)).toBe('config');
    expect(suggest('docter', commands)).toBe('doctor');
  });
  it('stays silent on garbage (no noisy suggestions)', () => {
    expect(suggest('xyzzy', commands)).toBeUndefined();
    expect(suggest('install', commands)).toBeUndefined();
  });
});

describe('ui.useColor — NO_COLOR / FORCE_COLOR policy', () => {
  const tty = { isTTY: true };
  const pipe = { isTTY: false };
  it('colors only a real TTY by default', () => {
    expect(useColor(tty, {})).toBe(true);
    expect(useColor(pipe, {})).toBe(false);
  });
  it('NO_COLOR disables color even on a TTY (no-color.org)', () => {
    expect(useColor(tty, { NO_COLOR: '1' })).toBe(false);
    expect(useColor(tty, { NO_COLOR: '' })).toBe(false); // presence, not value
  });
  it('FORCE_COLOR wins, even over NO_COLOR, even piped', () => {
    expect(useColor(pipe, { FORCE_COLOR: '1' })).toBe(true);
    expect(useColor(tty, { FORCE_COLOR: '1', NO_COLOR: '1' })).toBe(true);
    expect(useColor(tty, { FORCE_COLOR: '0' })).toBe(false); // explicit off
  });
});

describe('doctor.detectInstall — honest install check in every context', () => {
  const version = '9.9.9';

  it('recognizes a bun standalone binary and reports it self-contained (the compiled-binary ✗ fix)', () => {
    const url = 'file:///$bunfs/root/glam-darwin-arm64';
    expect(isStandaloneBuild(url)).toBe(true);
    const res = detectInstall({ moduleUrl: url, version });
    expect(res.ok).toBe(true);
    expect(res.label).toContain('standalone binary v9.9.9');
    // Windows-style bunfs mount too.
    expect(isStandaloneBuild('file:///B:/~BUN/root/glam.exe')).toBe(true);
  });

  it('passes in the repo checkout (real package.json, real version)', () => {
    const realVersion = execFileSync('node', [join(repoRoot, 'scripts', 'version.mjs')], {
      encoding: 'utf8',
    }).trim();
    const url = pathToFileURL(join(here, '..', 'src', 'doctor.mjs')).href;
    const res = detectInstall({ moduleUrl: url, version: realVersion });
    expect(res.ok).toBe(true);
    expect(res.label).toContain(realVersion);
  });

  it('flags version drift between the running CLI and its package.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'glam-doctor-'));
    try {
      mkdirSync(join(dir, 'dist', 'cli', 'src'), { recursive: true });
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: 'glamfire', version: '0.0.1' }),
      );
      const url = pathToFileURL(join(dir, 'dist', 'cli', 'src', 'glam.mjs')).href;
      const res = detectInstall({ moduleUrl: url, version });
      expect(res.ok).toBe(false);
      expect(res.hint).toContain('version drift');
      expect(res.fix).toContain('npm i -g glamfire');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('flags a missing/unreadable package.json with a copy-paste fix', () => {
    const dir = mkdtempSync(join(tmpdir(), 'glam-doctor-'));
    try {
      const url = pathToFileURL(join(dir, 'a', 'b', 'c', 'glam.mjs')).href;
      const res = detectInstall({ moduleUrl: url, version });
      expect(res.ok).toBe(false);
      expect(res.fix).toContain('npm i -g glamfire');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('run.exitCodeForStatus — the documented, stable exit-code scheme (issue #23)', () => {
  it('maps every run status to its documented code (0/1/3/130)', () => {
    expect(exitCodeForStatus('done')).toBe(0);
    expect(exitCodeForStatus('error')).toBe(1);
    // Regression: a budget stop used to exit 0, indistinguishable from done.
    expect(exitCodeForStatus('budget_exhausted')).toBe(3);
    expect(exitCodeForStatus('interrupted')).toBe(130);
  });
});

describe('run.providerModelHeader — provider + model family, never the adapter id (issue #24)', () => {
  it('shows provider + DeepSeek family for a DeepSeek run through the shared Fireworks adapter', () => {
    const model = 'accounts/fireworks/models/deepseek-v4-flash';
    const config = resolveFireworksConfig({ FIREWORKS_API_KEY: 'test-key' }, { model });
    const adapter = createFireworksGlmAdapter(config);
    const line = providerModelHeader(adapter, model);
    expect(line).toContain('provider: fireworks');
    expect(line).toContain(`deepseek-v4-flash (${model})`);
    // The regression itself: the shared adapter's internal id must not leak.
    expect(line).not.toContain('fireworks-glm');
  });

  it('shows the GLM family for the default workhorse', () => {
    const config = resolveFireworksConfig({ FIREWORKS_API_KEY: 'test-key' });
    const adapter = createFireworksGlmAdapter(config);
    const line = providerModelHeader(adapter, config.model);
    expect(line).toContain('provider: fireworks');
    expect(line).toContain(`glm-5.2 (${config.model})`);
  });

  it('shows a bare model id when the family equals the served id (anthropic)', () => {
    const config = resolveAnthropicConfig({ ANTHROPIC_API_KEY: 'test-key' });
    const adapter = createAnthropicAdapter(config);
    const line = providerModelHeader(adapter, config.model);
    expect(line).toContain('provider: anthropic');
    expect(line).not.toContain('('); // no redundant "family (family)" parens
  });
});

describe('real CLI — exit codes and error surfaces', () => {
  it('suggests the nearest command on a typo and exits 2', () => {
    const r = glam(['rout']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown command "rout"');
    expect(r.stderr).toContain('Did you mean `glam route`?');
  });

  it('calls an unknown flag an option, not a command', () => {
    const r = glam(['--frobnicate']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown option "--frobnicate"');
  });

  it('rejects a non-numeric --max-usd instead of silently disabling the budget ceiling', () => {
    const r = glam(['run', 'hi', '--max-usd', 'abc']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--max-usd expects a number');
  });

  it('rejects unknown single-dash flags instead of folding them into the prompt', () => {
    const r = glam(['route', 'hi', '-x']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown option "-x"');
  });

  it('rejects a non-numeric --output-tokens on route', () => {
    const r = glam(['route', 'hi', '--output-tokens', 'many']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--output-tokens expects a number');
  });

  it('help orients a first-run user: doctor first, key next, then a real run', () => {
    const r = glam(['help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('Get started');
    expect(r.stdout).toContain('glam doctor');
    expect(r.stdout).toContain('FIREWORKS_API_KEY');
  });

  it('documents the stable exit-code scheme in glam help and glam run --help (issue #23)', () => {
    const help = glam(['help']);
    expect(help.stdout).toContain('Exit codes');
    expect(help.stdout).toContain('3 budget/step ceiling');
    const runHelp = glam(['run', '--help']);
    expect(runHelp.status).toBe(0);
    expect(runHelp.stdout).toContain('Exit codes');
    expect(runHelp.stdout).toMatch(/3\s+budget stop/);
    expect(runHelp.stdout).toMatch(/130\s+interrupted/);
  });

  it('doctor prints a copy-paste fix for a missing key and exits 1', () => {
    const env = { ...process.env };
    env.FIREWORKS_API_KEY = undefined;
    const r = glam(['doctor'], { env });
    expect(r.status).toBe(1);
    expect(r.stdout).toContain('fix: export FIREWORKS_API_KEY=');
    // The install line must be a ✓ in the repo checkout (regression for the
    // old blind package.json check).
    expect(r.stdout).toMatch(/✓ glamfire install/);
  });
});

describe('real CLI — color policy end-to-end', () => {
  it('emits no ANSI when piped (default)', () => {
    const r = glam(['config'], {
      env: { ...process.env, NO_COLOR: undefined, FORCE_COLOR: undefined },
    });
    expect(r.stdout).not.toContain('\x1b[');
  });
  it('FORCE_COLOR=1 emits ANSI even when piped, and beats NO_COLOR', () => {
    const r = glam(['config'], { env: { ...process.env, FORCE_COLOR: '1', NO_COLOR: '1' } });
    expect(r.stdout).toContain('\x1b[');
  });
});

describe('real CLI — `glam ... | head` must not EPIPE-crash', () => {
  it('exits cleanly when the read end of the pipe closes early', async () => {
    // Portable `| head -1`: spawn the real CLI, read one chunk, destroy the
    // pipe — exactly what head does (and works on Windows).
    const { spawn } = await import('node:child_process');
    const stderr = await new Promise((resolvePromise) => {
      const p = spawn(process.execPath, [cli, 'config'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let err = '';
      p.stdout.once('data', () => p.stdout.destroy());
      p.stderr.on('data', (d) => {
        err += d;
      });
      p.on('close', () => resolvePromise(err));
    });
    expect(stderr).not.toContain('EPIPE');
    expect(stderr).not.toContain('node:internal');
  });
});
