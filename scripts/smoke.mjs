#!/usr/bin/env node
// Smoke test: exercise the REAL glam CLI the way a human would (SPEC §10).
// No mocks. Spawns the actual binary and asserts real output.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

check('glam run --help documents the stable exit-code scheme (issue #23)', () => {
  const out = run('run', '--help');
  if (!out.includes('Exit codes')) throw new Error('run help missing Exit codes section');
  if (!/3\s+budget stop/.test(out)) throw new Error('run help missing exit 3 for a budget stop');
  if (!/130\s+interrupted/.test(out)) throw new Error('run help missing exit 130 for Ctrl-C');
  const help = run('help');
  if (!help.includes('3 budget/step ceiling')) {
    throw new Error('glam help missing the exit-code summary');
  }
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

// --- memory in the loop (SPEC §5.2, issue #27) --------------------------------
// The brain is wired into `glam run`: recall before, episode capture after.

check('glam run --help documents memory in the loop and --no-memory', () => {
  const out = run('run', '--help');
  if (!out.includes('--no-memory')) throw new Error('missing --no-memory option');
  if (!out.includes('brain')) throw new Error('run help should describe the brain memory loop');
  if (!out.includes('GLAM_MEMORY')) throw new Error('run help should name the env kill switch');
});

if (process.env.FIREWORKS_API_KEY) {
  // Two REAL GLM calls in a hermetic scratch project: the first run teaches a
  // fact (captured as an episode in .glam/brain.db), the second run must
  // demonstrably recall it — the headline "own your context" claim, live.
  check('live: glam run teaches, then a second run RECALLS via the project brain', () => {
    const dir = mkdtempSync(join(tmpdir(), 'glam-smoke-memory-'));
    try {
      const home = join(dir, 'home');
      mkdirSync(home, { recursive: true });
      const env = {
        PATH: process.env.PATH,
        HOME: home,
        USERPROFILE: home,
        FIREWORKS_API_KEY: process.env.FIREWORKS_API_KEY,
      };
      const runGlam = (prompt) =>
        execFileSync('node', [cli, 'run', '--no-stream', prompt], {
          encoding: 'utf8',
          cwd: dir,
          env,
          timeout: 180_000,
        });
      const first = runGlam(
        "Remember this project decision for later: the internal release codename is 'copper-falcon-77'. Acknowledge briefly.",
      );
      if (!first.includes('memory: store empty — recalled 0')) {
        throw new Error(`first run should honestly recall 0 from an empty store:\n${first}`);
      }
      if (!/episode [0-9a-f]{8} saved/.test(first)) {
        throw new Error(`first run did not save an episode:\n${first}`);
      }
      if (!existsSync(join(dir, '.glam', 'brain.db'))) {
        throw new Error('brain store .glam/brain.db was not created in the project');
      }
      const second = runGlam(
        'What is the internal release codename? Answer with just the codename.',
      );
      if (!/memory: recalled [1-9]/.test(second)) {
        throw new Error(`second run recalled nothing from the brain:\n${second}`);
      }
      if (!second.includes('copper-falcon-77')) {
        throw new Error(`second run did not recall the taught fact:\n${second}`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
} else {
  // Never faked: without a key there is no real provider call to make. Say so
  // loudly (same policy as the CI self-hosting gate) instead of a silent skip.
  process.stdout.write(
    '  ! live memory round-trip NOT verified: FIREWORKS_API_KEY is not set — set it to exercise the teach→recall smoke\n',
  );
}

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
