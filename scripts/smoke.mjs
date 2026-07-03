#!/usr/bin/env node
// Smoke test: exercise the REAL glam CLI the way a human would (SPEC §10).
// No mocks. Spawns the actual binary and asserts real output.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'packages', 'cli', 'src', 'index.mjs');
const VERSION = readFileSync(join(root, 'VERSION'), 'utf8').trim();

let failures = 0;
function check(name, fn) {
  try {
    fn();
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (err) {
    failures += 1;
    process.stdout.write(`  ✗ ${name}\n    ${err.message}\n`);
  }
}
const run = (...args) => execFileSync('node', [cli, ...args], { encoding: 'utf8' });

process.stdout.write('glam smoke test\n');

check('glam --version prints VERSION', () => {
  const out = run('--version').trim();
  if (out !== VERSION) throw new Error(`got "${out}", want "${VERSION}"`);
});

check('glam version prints VERSION', () => {
  const out = run('version').trim();
  if (out !== VERSION) throw new Error(`got "${out}", want "${VERSION}"`);
});

check('glam help mentions the harness tagline and the version', () => {
  const out = run('help');
  if (!out.includes('last mile of AI')) throw new Error('missing tagline');
  if (!out.includes(VERSION)) throw new Error('help banner missing version');
});

check('glam doctor reports the version banner', () => {
  // doctor exits non-zero when env is incomplete; capture output regardless.
  let out = '';
  try {
    out = run('doctor');
  } catch (err) {
    out = String(err.stdout ?? '');
  }
  if (!out.includes(`glamfire ${VERSION}`)) throw new Error('doctor banner missing version');
  if (!out.includes('Node.js')) throw new Error('doctor missing Node check');
  // Config-file presence check (issue #12).
  if (!out.includes('config')) throw new Error('doctor missing config-file check');
});

check('unknown command exits non-zero', () => {
  try {
    run('nonsense-command');
    throw new Error('expected non-zero exit');
  } catch (err) {
    if (err.status !== 2) throw new Error(`expected exit 2, got ${err.status}`);
  }
});

check('glam run --help shows the run usage', () => {
  const out = run('run', '--help');
  if (!out.includes('glam run')) throw new Error('missing run usage header');
  if (!out.includes('--effort')) throw new Error('missing --effort option');
  if (!out.includes('FIREWORKS_API_KEY')) throw new Error('missing key requirement note');
  // Dogfood edit->run loop: run_command is opt-in and least-privilege (issue M1).
  if (!out.includes('--allow-exec')) throw new Error('missing --allow-exec option');
  if (!out.includes('run_command')) throw new Error('run help should describe run_command');
});

check('glam run without a prompt exits 2', () => {
  try {
    run('run');
    throw new Error('expected non-zero exit');
  } catch (err) {
    if (err.status !== 2) throw new Error(`expected exit 2, got ${err.status}`);
  }
});

check('glam help lists the route command', () => {
  const out = run('help');
  if (!out.includes('route')) throw new Error('help missing route command');
});

check('glam help lists the models command and models --help documents refresh', () => {
  const out = run('help');
  if (!out.includes('models')) throw new Error('help missing models command');
  const modelsHelp = run('models', '--help');
  if (!modelsHelp.includes('--refresh')) throw new Error('models help missing --refresh');
  if (!modelsHelp.includes('--capable')) throw new Error('models help missing --capable');
});

check('glam route --help shows the offline routing usage', () => {
  const out = run('route', '--help');
  if (!out.includes('glam route')) throw new Error('missing route usage header');
  if (!out.includes('offline')) throw new Error('route help should note it is offline');
});

check('glam route without a prompt exits 2', () => {
  try {
    run('route');
    throw new Error('expected non-zero exit');
  } catch (err) {
    if (err.status !== 2) throw new Error(`expected exit 2, got ${err.status}`);
  }
});

check('glam route classifies a center prompt offline (no API key needed)', () => {
  // The routing dry-run must work with NO key and never call a provider: it
  // classifies, resolves the policy, and prints a decision + distribution report.
  const { FIREWORKS_API_KEY: _omit, ...env } = process.env;
  const out = execFileSync('node', [cli, 'route', 'Summarize this paragraph in one sentence.'], {
    encoding: 'utf8',
    env,
  });
  if (!/route decision/.test(out)) throw new Error('missing route decision block');
  if (!/distribution:\s+center/.test(out))
    throw new Error('center prompt not classified as center');
  if (!/chosen model:\s+accounts\/fireworks\/models\/glm-5p2/.test(out)) {
    throw new Error('center work should route to GLM 5.2 on Fireworks by default');
  }
  if (!/distribution report/.test(out)) throw new Error('missing distribution report');
});

check('glam route classifies a clearly-edge prompt as edge offline', () => {
  const { FIREWORKS_API_KEY: _omit, ...env } = process.env;
  const out = execFileSync(
    'node',
    [
      cli,
      'route',
      'Design and architect a distributed system from scratch; reason step by step ' +
        'about the trade-offs, prove correctness, and handle every tricky edge case.',
    ],
    { encoding: 'utf8', env },
  );
  if (!/distribution:\s+edge/.test(out)) throw new Error('edge prompt not classified as edge');
});

check('glam route --json emits valid structured output offline', () => {
  const { FIREWORKS_API_KEY: _omit, ...env } = process.env;
  const out = execFileSync('node', [cli, 'route', '--json', 'classify this ticket'], {
    encoding: 'utf8',
    env,
  });
  const parsed = JSON.parse(out);
  if (parsed.classification?.distribution !== 'center') {
    throw new Error('routine classify task should be center');
  }
  if (typeof parsed.classification.confidence !== 'number') {
    throw new Error('confidence must be a number');
  }
  if (typeof parsed.report?.savedUsd !== 'number') throw new Error('report.savedUsd missing');
});

// --- glam models: the evergreen model/provider landscape (no key needed) ------
// The built-in catalog must render offline: a fresh human on a laptop with no
// API key can still see the whole landscape (prices carry their asOf dates).

function runModels(args, extraEnv = {}) {
  // Hermetic HOME so a developer's real ~/.glam/cache/models.json (from a
  // previous --refresh) cannot leak into the assertions; strip provider keys.
  const dir = mkdtempSync(join(tmpdir(), 'glam-smoke-models-'));
  try {
    const {
      FIREWORKS_API_KEY: _f,
      TOGETHER_API_KEY: _t,
      ANTHROPIC_API_KEY: _a,
      ...env
    } = process.env;
    return execFileSync('node', [cli, 'models', ...args], {
      encoding: 'utf8',
      env: { ...env, HOME: dir, USERPROFILE: dir, ...extraEnv },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

check('glam models renders the built-in catalog offline (no API key)', () => {
  const out = runModels([]);
  if (!out.includes(`glamfire ${VERSION}`)) throw new Error('models header missing version');
  if (!out.includes('built-in catalog')) throw new Error('missing catalog-source note');
  if (!/glm-5\.2\s+fireworks\s+\$1\.40\s+\$4\.40\s+FP8/.test(out)) {
    throw new Error('default workhorse row (GLM 5.2 @ fireworks, FP8) missing');
  }
  if (!/glm-5\.2\s+together\s+\$1\.40\s+\$4\.40\s+FP4/.test(out)) {
    throw new Error('Together GLM FP4 caveat row missing');
  }
  if (!out.includes('AS-OF')) throw new Error('asOf column missing');
  if (!out.includes('2026-')) throw new Error('asOf dates missing');
});

check('glam models --json emits the structured catalog', () => {
  const parsed = JSON.parse(runModels(['--json']));
  if (parsed.source !== 'builtin') throw new Error('expected builtin source offline');
  if (!Array.isArray(parsed.entries) || parsed.entries.length < 10) {
    throw new Error('expected a broad catalog (>=10 entries)');
  }
  for (const e of parsed.entries) {
    for (const field of ['model', 'provider', 'endpoint', 'contextK', 'asOf', 'sourceUrl']) {
      if (e[field] === undefined) throw new Error(`entry missing ${field}`);
    }
  }
});

check('glam models --capable and --sort price shape the view', () => {
  const vision = JSON.parse(runModels(['--capable', 'vision', '--json']));
  if (vision.entries.length === 0) throw new Error('no vision-capable models');
  if (!vision.entries.every((e) => e.capabilities.includes('vision'))) {
    throw new Error('--capable vision leaked a non-vision model');
  }
  const sorted = JSON.parse(runModels(['--sort', 'price', '--json']));
  const first = sorted.entries[0];
  if (first.usdPerMInput + first.usdPerMOutput > 1) {
    throw new Error('--sort price should surface the cheapest model first');
  }
});

check('glam models --refresh without any provider key degrades honestly (exit 1)', () => {
  try {
    runModels(['--refresh']);
    throw new Error('expected non-zero exit');
  } catch (err) {
    if (err.status !== 1) throw new Error(`expected exit 1, got ${err.status}`);
    const text = String(err.stdout ?? '') + String(err.stderr ?? '');
    if (!text.includes('nothing could be refreshed')) throw new Error('missing honest notice');
    if (!text.includes('TOGETHER_API_KEY')) throw new Error('missing key guidance');
  }
});

check('glam run without FIREWORKS_API_KEY fails with actionable guidance', () => {
  // Real surface, real config resolution: with no key the run command must fail
  // loudly and tell the user exactly what to do — never silently fake a call.
  const { FIREWORKS_API_KEY: _omit, ...env } = process.env;
  try {
    execFileSync('node', [cli, 'run', 'say hi'], { encoding: 'utf8', env });
    throw new Error('expected non-zero exit');
  } catch (err) {
    if (err.status !== 1) throw new Error(`expected exit 1, got ${err.status}`);
    const text = String(err.stdout ?? '') + String(err.stderr ?? '');
    if (!text.includes('FIREWORKS_API_KEY')) throw new Error('missing key guidance');
  }
});

// --- glam config: the layered configuration surface (SPEC §6) -----------------
// Drive the real binary against real temp config files (user + project) and a
// real env var, then assert precedence, provenance, upward project discovery,
// and — critically — that no secret leaks into the output (SPEC §8). Hermetic:
// a temp HOME/cwd, never the developer's real ~/.glam.

function withConfigFixture(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'glam-smoke-config-'));
  const home = join(dir, 'home');
  const projRoot = join(dir, 'proj');
  const cwd = join(projRoot, 'nested', 'deep');
  mkdirSync(join(home, '.glam'), { recursive: true });
  mkdirSync(cwd, { recursive: true });
  try {
    return fn({ home, projRoot, cwd });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const baseEnv = (home, extra) => ({
  PATH: process.env.PATH,
  HOME: home,
  USERPROFILE: home,
  ...extra,
});

check('glam config resolves layered precedence with provenance and redacts secrets', () => {
  withConfigFixture(({ home, projRoot, cwd }) => {
    writeFileSync(
      join(home, '.glam', 'config.toml'),
      'model = "user-model"\n[run]\neffort = "max"\n',
    );
    writeFileSync(
      join(projRoot, 'glam.toml'),
      'model = "project-model"\n[run]\ntemperature = 0.7\n',
    );
    const env = baseEnv(home, {
      GLAM_MODEL: 'env-model',
      FIREWORKS_API_KEY: 'sk-smoke-SECRET-123',
    });
    const out = execFileSync('node', [cli, 'config'], { encoding: 'utf8', cwd, env });

    // Precedence: env (model) > project (temperature) > user (effort) > defaults.
    if (!/\bmodel\s+=\s+env-model\s+\[env\]/.test(out)) {
      throw new Error(`model precedence (env) not shown in:\n${out}`);
    }
    if (!/\brun\.effort\s+=\s+max\s+\[user\]/.test(out))
      throw new Error('run.effort (user) not shown');
    if (!/\brun\.temperature\s+=\s+0\.7\s+\[project\]/.test(out)) {
      throw new Error('run.temperature (project) not shown');
    }
    // Upward project-config discovery from a nested cwd.
    if (!out.includes(join(projRoot, 'glam.toml')))
      throw new Error('project config path not reported');
    // Redaction: the secret VALUE must never appear; presence is shown as "set".
    if (out.includes('sk-smoke-SECRET-123'))
      throw new Error('SECRET LEAKED into `glam config` output');
    if (!/fireworks\s+env:FIREWORKS_API_KEY\s+.*set/.test(out)) {
      throw new Error('fireworks credential not reported as set');
    }
  });
});

check('glam config --json emits valid JSON with secrets redacted', () => {
  withConfigFixture(({ home }) => {
    const env = baseEnv(home, { FIREWORKS_API_KEY: 'sk-json-SECRET-456' });
    const out = execFileSync('node', [cli, 'config', '--json'], {
      encoding: 'utf8',
      cwd: home,
      env,
    });
    if (out.includes('sk-json-SECRET-456')) throw new Error('SECRET LEAKED into --json output');
    const parsed = JSON.parse(out);
    if (parsed.config.model !== 'accounts/fireworks/models/glm-5p2') {
      throw new Error('unexpected default model in --json');
    }
    const fw = parsed.credentials.find((c) => c.provider === 'fireworks');
    if (!fw || fw.resolved !== true) throw new Error('fireworks credential not resolved in --json');
  });
});

check('glam config fails loudly (exit 1) on invalid config', () => {
  withConfigFixture(({ home, projRoot }) => {
    writeFileSync(join(projRoot, 'glam.toml'), '[run]\neffort = "turbo"\n');
    const env = baseEnv(home, {});
    try {
      execFileSync('node', [cli, 'config'], { encoding: 'utf8', cwd: projRoot, env });
      throw new Error('expected non-zero exit');
    } catch (err) {
      if (err.status !== 1) throw new Error(`expected exit 1, got ${err.status}`);
      const text = String(err.stdout ?? '') + String(err.stderr ?? '');
      if (!text.includes('run.effort')) throw new Error('error missing offending field');
      if (!text.includes('glam.toml')) throw new Error('error missing offending file');
    }
  });
});

process.stdout.write(`\n${failures === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failures})`}\n`);
process.exit(failures === 0 ? 0 : 1);
