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

process.stdout.write(`\n${failures === 0 ? 'SMOKE PASS' : `SMOKE FAIL (${failures})`}\n`);
process.exit(failures === 0 ? 0 : 1);
