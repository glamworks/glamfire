#!/usr/bin/env node
// Smoke test: exercise the REAL glam CLI the way a human would (SPEC §10).
// No mocks. Spawns the actual binary and asserts real output.
import { execFileSync, spawn } from 'node:child_process';
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

check('a command typo gets a "did you mean" suggestion', () => {
  try {
    run('rout');
    throw new Error('expected non-zero exit');
  } catch (err) {
    if (err.status !== 2) throw new Error(`expected exit 2, got ${err.status}`);
    if (!String(err.stderr).includes('Did you mean `glam route`?')) {
      throw new Error('missing "did you mean" suggestion for `rout`');
    }
  }
});

check('help orients a first-run user (get started + doctor + key)', () => {
  const out = run('help');
  if (!out.includes('Get started')) throw new Error('help missing Get started section');
  if (!out.includes('glam doctor')) throw new Error('help missing doctor pointer');
  if (!out.includes('FIREWORKS_API_KEY')) throw new Error('help missing key pointer');
});

check('doctor gives a copy-paste fix for a missing key and a green install check', () => {
  const { FIREWORKS_API_KEY: _omit, ...env } = process.env;
  let out = '';
  try {
    out = execFileSync('node', [cli, 'doctor'], { encoding: 'utf8', env });
  } catch (err) {
    if (err.status !== 1) throw new Error(`expected exit 1 without a key, got ${err.status}`);
    out = String(err.stdout ?? '');
  }
  if (!out.includes('fix: export FIREWORKS_API_KEY='))
    throw new Error('doctor missing copy-paste key fix');
  // Regression: the install check must pass from a repo checkout (and, fixed
  // for v0.3.x, from inside the compiled binary — see packages/cli/test).
  if (!/✓ glamfire install/.test(out)) throw new Error('doctor install check not green');
});

check('a non-numeric budget flag is rejected (exit 2), never a silent NaN ceiling', () => {
  try {
    run('run', 'hi', '--max-usd', 'abc');
    throw new Error('expected non-zero exit');
  } catch (err) {
    if (err.status !== 2) throw new Error(`expected exit 2, got ${err.status}`);
    if (!String(err.stderr).includes('expects a number'))
      throw new Error('missing numeric-flag error message');
  }
});

check('glam config | head does not EPIPE-crash (early pipe close)', () => {
  // Portable `| head -1`: a wrapper node process spawns the real CLI, reads one
  // chunk, then destroys the pipe — exactly what head does. Works on Windows too.
  const script = `
    const { spawn } = require('node:child_process');
    const p = spawn(process.execPath, [process.argv[1], 'config'], { stdio: ['ignore','pipe','pipe'] });
    let err = '';
    p.stdout.once('data', () => p.stdout.destroy());
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', () => {
      if (/EPIPE|node:internal/.test(err)) { process.stderr.write(err); process.exit(1); }
      process.exit(0);
    });
  `;
  execFileSync('node', ['-e', script, cli], { encoding: 'utf8' });
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

check('glam route picks DeepSeek-V4-Flash as cheapest capable when a rule lists it', () => {
  // Real end-to-end routing over the DeepSeek tiering (research/25), offline,
  // no key: a project glam.toml prefers the budget tier for center work; the
  // router must pick deepseek-v4-flash ($0.14/$0.28 — cheapest survivor) from
  // real registered capabilities + pricing, not GLM.
  const dir = mkdtempSync(join(tmpdir(), 'glam-smoke-deepseek-'));
  try {
    writeFileSync(
      join(dir, 'glam.toml'),
      '[[routing.rules]]\n' +
        'distribution = "center"\n' +
        'requires = ["tool_calling", "long_context"]\n' +
        'candidates = [\n' +
        '  "accounts/fireworks/models/deepseek-v4-flash",\n' +
        '  "accounts/fireworks/models/glm-5p2",\n' +
        '  "accounts/fireworks/models/deepseek-v4-pro",\n' +
        ']\n',
    );
    const env = { PATH: process.env.PATH, HOME: dir, USERPROFILE: dir };
    const out = execFileSync('node', [cli, 'route', 'Summarize this paragraph in one sentence.'], {
      encoding: 'utf8',
      cwd: dir,
      env,
    });
    if (!/chosen model:\s+accounts\/fireworks\/models\/deepseek-v4-flash/.test(out)) {
      throw new Error(`cheapest capable candidate should be DeepSeek-V4-Flash, got:\n${out}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
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

// --- glam usage: the local usage ledger (monitoring, usage & billing) ---------
// Fully offline: the ledger read path never needs an API key. Drive the real
// binary against a hermetic HOME with a real seeded ~/.glam/usage.jsonl.

check('glam help lists the usage command', () => {
  const out = run('help');
  if (!out.includes('usage')) throw new Error('help missing usage command');
});

check('glam usage --help shows the ledger usage (offline)', () => {
  const out = run('usage', '--help');
  if (!out.includes('glam usage')) throw new Error('missing usage header');
  if (!out.includes('usage.jsonl')) throw new Error('help should name the ledger file');
  if (!out.includes('--since')) throw new Error('missing --since option');
  if (!out.includes('monthlyBudgetUsd')) throw new Error('help should document budget config');
});

check('glam usage with an empty ledger reports zero spend (no key needed)', () => {
  withConfigFixture(({ home, cwd }) => {
    // No FIREWORKS_API_KEY in this env: the ledger read path must not need one.
    const out = execFileSync('node', [cli, 'usage'], { encoding: 'utf8', cwd, env: baseEnv(home) });
    if (!out.includes(`glamfire ${VERSION}`)) throw new Error('usage header missing version');
    if (!out.includes('No usage recorded yet')) throw new Error('empty ledger not reported');
  });
});

check('glam usage totals a seeded ledger with per-model split and budget bar', () => {
  withConfigFixture(({ home, projRoot, cwd }) => {
    const now = new Date().toISOString();
    const usage = { inputTokens: 1000, cachedInputTokens: 100, outputTokens: 500 };
    const rec1 = {
      v: 1,
      ts: now,
      provider: 'fireworks',
      model: 'accounts/fireworks/models/glm-5p2',
      status: 'done',
      costUsd: 0.01,
      usage,
      escalations: [],
      models: [
        {
          model: 'accounts/fireworks/models/glm-5p2',
          provider: 'fireworks',
          turns: 2,
          costUsd: 0.01,
          usage,
        },
      ],
    };
    const rec2 = {
      ...rec1,
      costUsd: 0.04,
      escalations: [{ from: 'glm-5p2', to: 'claude-sonnet-4-5', trigger: 'verify failed' }],
      models: [
        {
          model: 'accounts/fireworks/models/glm-5p2',
          provider: 'fireworks',
          turns: 1,
          costUsd: 0.01,
          usage,
        },
        { model: 'claude-sonnet-4-5', provider: 'anthropic', turns: 1, costUsd: 0.03, usage },
      ],
    };
    writeFileSync(
      join(home, '.glam', 'usage.jsonl'),
      `${JSON.stringify(rec1)}\n${JSON.stringify(rec2)}\n`,
    );
    // Budget config: $0.05 spent of $0.10 => 50%, above a 40% warn threshold.
    writeFileSync(
      join(projRoot, 'glam.toml'),
      '[usage]\nmonthlyBudgetUsd = 0.10\nwarnAtPct = 40\n',
    );
    const env = baseEnv(home);

    const out = execFileSync('node', [cli, 'usage'], { encoding: 'utf8', cwd, env });
    if (!out.includes(`glamfire ${VERSION}`)) throw new Error('usage header missing version');
    if (!/runs:\s*2/.test(out)) throw new Error('run total wrong');
    if (!out.includes('$0.0500')) throw new Error(`total cost not shown:\n${out}`);
    if (!out.includes('by model')) throw new Error('missing by-model breakdown');
    if (!out.includes('claude-sonnet-4-5')) throw new Error('escalated model missing from table');
    if (!out.includes('by provider')) throw new Error('missing by-provider breakdown');
    if (!out.includes('anthropic')) throw new Error('escalated provider missing');
    if (!/escalations:\s*1/.test(out)) throw new Error('escalation count missing');
    if (!out.includes('50.0%')) throw new Error('budget percentage missing');
    if (!out.includes('warn at 40%')) throw new Error('warn threshold missing from budget bar');
    if (!out.includes('over 40% of the monthly budget')) throw new Error('budget warning missing');

    // --json: structured, machine-readable, same numbers.
    const parsed = JSON.parse(
      execFileSync('node', [cli, 'usage', '--json'], { encoding: 'utf8', cwd, env }),
    );
    if (parsed.totals.runs !== 2) throw new Error('--json run total wrong');
    if (Math.abs(parsed.totals.costUsd - 0.05) > 1e-9) throw new Error('--json cost total wrong');
    if (parsed.budget?.level !== 'warn') throw new Error('--json budget level should be warn');
    const claude = parsed.byModel.find((m) => m.key === 'claude-sonnet-4-5');
    if (!claude || Math.abs(claude.costUsd - 0.03) > 1e-9) {
      throw new Error('--json per-model escalation cost wrong');
    }

    // --since filters out old records.
    const old = { ...rec1, ts: '2020-01-01T00:00:00.000Z', costUsd: 99 };
    writeFileSync(
      join(home, '.glam', 'usage.jsonl'),
      `${JSON.stringify(old)}\n${JSON.stringify(rec1)}\n`,
    );
    const since = JSON.parse(
      execFileSync('node', [cli, 'usage', '--json', '--since', '7d'], {
        encoding: 'utf8',
        cwd,
        env,
      }),
    );
    if (since.totals.runs !== 1) throw new Error('--since did not filter old records');
  });
});

check('glam usage fails loudly on an invalid [usage] config', () => {
  withConfigFixture(({ home, projRoot, cwd }) => {
    writeFileSync(join(projRoot, 'glam.toml'), '[usage]\nwarnAtPct = 500\n');
    try {
      execFileSync('node', [cli, 'usage'], { encoding: 'utf8', cwd, env: baseEnv(home) });
      throw new Error('expected non-zero exit');
    } catch (err) {
      if (err.status !== 1) throw new Error(`expected exit 1, got ${err.status}`);
      const text = String(err.stdout ?? '') + String(err.stderr ?? '');
      if (!text.includes('usage.warnAtPct')) throw new Error('error missing offending field');
    }
  });
});

// --- glam serve: the router-as-proxy gateway (research/32 item 4) -------------
// Drive the REAL server over real sockets: startup banner, health, auth
// rejection, and the hard budget stop (which by design never reaches a
// provider, so it is fully verifiable offline). When a real FIREWORKS_API_KEY
// is present, one REAL request flows through the proxy to GLM on Fireworks and
// must land in the ledger — the first-party meter, live.

async function checkAsync(name, fn) {
  try {
    await fn();
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (err) {
    failures += 1;
    process.stdout.write(`  ✗ ${name}\n    ${err.message}\n`);
  }
}

/** Spawn `glam serve` and resolve with its base URL once it is listening. */
function startServe({ home, cwd, env, args = [] }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn('node', [cli, 'serve', '--port', '0', ...args], {
      cwd,
      env: { ...baseEnv(home, env), NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      child.kill('SIGKILL');
      rejectPromise(new Error(`serve did not start in time:\n${out}`));
    }, 15000);
    child.stdout.on('data', (chunk) => {
      out += String(chunk);
      const m = out.match(/listening: (http:\/\/[^\s]+)/);
      if (m && !done) {
        done = true;
        clearTimeout(timer);
        resolvePromise({ child, url: m[1], output: () => out });
      }
    });
    child.stderr.on('data', (chunk) => {
      out += String(chunk);
    });
    child.on('exit', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      rejectPromise(new Error(`serve exited before listening:\n${out}`));
    });
  });
}

check('glam help lists the serve command', () => {
  const out = run('help');
  if (!out.includes('serve')) throw new Error('help missing serve command');
});

check('glam serve --help documents the Claude Code env override and budgets', () => {
  const out = run('serve', '--help');
  if (!out.includes('ANTHROPIC_BASE_URL')) throw new Error('missing ANTHROPIC_BASE_URL line');
  if (!out.includes('ANTHROPIC_AUTH_TOKEN')) throw new Error('missing ANTHROPIC_AUTH_TOKEN line');
  if (!out.includes('/v1/messages')) throw new Error('missing anthropic endpoint');
  if (!out.includes('/v1/chat/completions')) throw new Error('missing openai endpoint');
  if (!out.includes('[serve.budgets]')) throw new Error('missing budget config docs');
});

check('glam serve refuses a non-loopback bind without an explicit token', () => {
  const { FIREWORKS_API_KEY: _omit, GLAM_SERVE_TOKEN: _omit2, ...env } = process.env;
  try {
    execFileSync('node', [cli, 'serve', '--bind', '0.0.0.0'], { encoding: 'utf8', env });
    throw new Error('expected non-zero exit');
  } catch (err) {
    if (err.status !== 1) throw new Error(`expected exit 1, got ${err.status}`);
    if (!String(err.stderr).includes('refusing to bind')) {
      throw new Error('missing non-loopback refusal message');
    }
  }
});

await checkAsync(
  'glam serve: health, version banner, auth 401, and the hard budget stop',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'glam-smoke-serve-'));
    const home = join(dir, 'home');
    mkdirSync(join(home, '.glam'), { recursive: true });
    // Seed spend over a tiny budget: the stop path never calls a provider, so a
    // placeholder key exercises the REAL rejection behavior end-to-end.
    writeFileSync(
      join(home, '.glam', 'usage.jsonl'),
      `${JSON.stringify({ v: 1, ts: new Date().toISOString(), source: 'proxy', client: 'claude-code', provider: 'fireworks', model: 'm', costUsd: 9, usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1 } })}\n`,
    );
    writeFileSync(join(dir, 'glam.toml'), '[serve.budgets]\nmonthlyUsd = 1.0\n');
    const started = await startServe({
      home,
      cwd: dir,
      env: { FIREWORKS_API_KEY: 'smoke-offline-never-called', GLAM_SERVE_TOKEN: 'smoke-token-123' },
    });
    try {
      if (!started.output().includes(`glamfire ${VERSION}`)) {
        throw new Error('serve banner missing version');
      }
      const health = await (await fetch(`${started.url}/healthz`)).json();
      if (health.glamfire !== VERSION) throw new Error('healthz missing version');

      const unauth = await fetch(`${started.url}/v1/messages`, { method: 'POST', body: '{}' });
      if (unauth.status !== 401)
        throw new Error(`expected 401 without token, got ${unauth.status}`);
      const unauthBody = await unauth.json();
      if (unauthBody.error?.type !== 'authentication_error') {
        throw new Error('401 body not anthropic-shaped');
      }

      const blocked = await fetch(`${started.url}/v1/messages`, {
        method: 'POST',
        headers: { authorization: 'Bearer smoke-token-123', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'x',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      });
      if (blocked.status !== 400)
        throw new Error(`expected 400 budget stop, got ${blocked.status}`);
      const blockedBody = await blocked.json();
      if (!String(blockedBody.error?.message).includes('budget stop')) {
        throw new Error('budget stop message missing');
      }
      if (!String(blockedBody.error?.message).includes('No provider was called')) {
        throw new Error('budget stop must state no provider call happened');
      }
    } finally {
      started.child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  },
);

if (process.env.FIREWORKS_API_KEY) {
  await checkAsync(
    'glam serve LIVE: a real request through the proxy to GLM on Fireworks is metered',
    async () => {
      const dir = mkdtempSync(join(tmpdir(), 'glam-smoke-serve-live-'));
      const home = join(dir, 'home');
      mkdirSync(join(home, '.glam'), { recursive: true });
      const started = await startServe({
        home,
        cwd: dir,
        env: {
          FIREWORKS_API_KEY: process.env.FIREWORKS_API_KEY,
          GLAM_SERVE_TOKEN: 'smoke-live-token',
        },
      });
      try {
        const res = await fetch(`${started.url}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer smoke-live-token',
            'content-type': 'application/json',
            'x-glam-client': 'smoke-live',
          },
          body: JSON.stringify({
            model: 'any',
            max_tokens: 512,
            messages: [{ role: 'user', content: 'Reply with exactly: smoke-live-ok' }],
          }),
        });
        if (res.status !== 200) {
          throw new Error(`live request failed: HTTP ${res.status} ${await res.text()}`);
        }
        const body = await res.json();
        const text = body.choices?.[0]?.message?.content ?? '';
        if (!text.includes('smoke-live-ok')) throw new Error(`unexpected live reply: ${text}`);
        const cost = Number(res.headers.get('x-glamfire-cost-usd'));
        if (!(cost > 0)) throw new Error('missing x-glamfire-cost-usd receipt header');

        const ledger = readFileSync(join(home, '.glam', 'usage.jsonl'), 'utf8')
          .trim()
          .split('\n');
        const rec = JSON.parse(ledger.at(-1));
        if (rec.source !== 'proxy' || rec.client !== 'smoke-live') {
          throw new Error('live request not metered with client label');
        }
        if (!(rec.costUsd > 0) || !(rec.usage.outputTokens > 0)) {
          throw new Error('live request metered without real usage');
        }
      } finally {
        started.child.kill('SIGKILL');
        rmSync(dir, { recursive: true, force: true });
      }
    },
  );
} else {
  process.stdout.write(
    '  ! glam serve LIVE check SKIPPED: FIREWORKS_API_KEY not set in this environment.\n' +
      '    The live proxy->GLM path is exercised wherever the key exists (CI runs it).\n',
  );
}

process.stdout.write(`\n${failures === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failures})`}\n`);
process.exit(failures === 0 ? 0 : 1);
