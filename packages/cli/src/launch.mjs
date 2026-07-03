// `glam launch <integration>` — one command that puts you on GLM 5.2 with an
// honest status line. Today only `claude` (Claude Code) is supported.
//
// What it does, end to end:
//   1. Resolves a glam serve gateway on 127.0.0.1:4114. If one is already up,
//      reuses it (and reads the bearer token from GLAM_SERVE_TOKEN). If not,
//      spawns `glam serve` as a child, parses the `listening: <url>` line and
//      the printed `ANTHROPIC_AUTH_TOKEN` from its stdout, and waits for
//      /healthz to go green. We own that serve and tear it down on exit.
//   2. Builds the env block that makes Claude Code's status line tell the truth
//      behind the gateway (ANTHROPIC_BASE_URL + AUTH_TOKEN + a non-Anthropic
//      model id + the documented _NAME/_DESCRIPTION vars so the line reads
//      "GLM 5.2 (via glamfire)" instead of a bare id).
//   3. Execs `claude` (resolved via PATH) with that env, stdio inherited so
//      claude owns the TTY. Everything after `--` is passed to claude verbatim.
//   4. On claude exit: if we spawned serve, SIGTERM it and wait; exit with
//      claude's exit code. A pre-existing serve is left running.
//
// Other integrations (opencode, cursor, codex, ...) exit 2 with a clear
// "not yet supported" notice + did-you-mean. That is an explicit unsupported
// notice, NOT a shim standing in for behavior (CLAUDE.md §4).

import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CODES, color, suggest, useColor } from './ui.mjs';

const { DIM, BOLD, FLAME } = CODES;

const SUPPORTED = ['claude'];
const DEFAULT_PORT = 4114;
const DEFAULT_BIND = '127.0.0.1';
const MODEL_ID = 'glm-5.2';
const DISPLAY_NAME = 'GLM 5.2 (via glamfire)';
const DISPLAY_DESCRIPTION = 'GLM 5.2 on Fireworks AI, routed through the glamfire gateway';

const LAUNCH_HELP = `glam launch <integration> — run an agent on GLM 5.2 via glam serve,
with an honest status line. One command: auto-starts the gateway,
sets the env, and execs the agent.

Usage: glam launch <integration> [-- <agent-args>...]

Integrations:
  claude            Claude Code (claude CLI). Auto-starts glam serve on
                    127.0.0.1:${DEFAULT_PORT} if it is not already running, sets
                    ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN plus the model-id
                    env vars so Claude Code's status line reads
                    "${DISPLAY_NAME}" instead of an Anthropic id, then execs
                    \`claude\` with stdio inherited.

Args after \`--\` are passed to the agent VERBATIM. glam launch does not parse,
filter, or reinterpret anything past \`--\` — not flags, not --help, not --model.
If you want to pass args to claude, use \`--\`:
  glam launch claude -- -p "hi"
  glam launch claude -- --model foo

Without \`--\`, no args are forwarded. Anything after the integration name that
is not \`--\` is treated as a glam launch usage error (use \`--\` to reach the
agent).

Env vars set for claude (all take effect behind ANTHROPIC_BASE_URL):
  ANTHROPIC_BASE_URL              glam serve URL (http://127.0.0.1:${DEFAULT_PORT})
  ANTHROPIC_AUTH_TOKEN            the serve bearer token
  ANTHROPIC_MODEL                 ${MODEL_ID} (non-Anthropic id → honest status line)
  ANTHROPIC_CUSTOM_MODEL_OPTION          ${MODEL_ID}
  ANTHROPIC_CUSTOM_MODEL_OPTION_NAME     "${DISPLAY_NAME}"
  ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION  ${DISPLAY_DESCRIPTION}
  ANTHROPIC_SMALL_FAST_MODEL      ${MODEL_ID} (background/haiku tasks also route here)

If glam serve is already running on 127.0.0.1:${DEFAULT_PORT}, it is reused and
GLAM_SERVE_TOKEN must be exported (the token the running serve was started with).
If we start serve ourselves, the token is parsed from its startup output and
serve is stopped when claude exits.

Options:
  --port <n>       Port for the auto-started glam serve (default ${DEFAULT_PORT};
                    0 = ephemeral, for testing). Ignored if a serve is reused.
  -h, --help       Show this help

Exit codes: 0 done · 1 error · 2 usage error · 130 interrupted
`;

/**
 * Build the env block that makes Claude Code's status line honest behind the
 * gateway. Pure: no spawning, no I/O — extracted so tests can call it directly.
 * Merges over `baseEnv` (defaults to {}) without clobbering caller-supplied
 * values; the wrapper's own vars are the defaults a real launch sets.
 */
export function buildLaunchEnv({
  serveUrl,
  token,
  modelId = MODEL_ID,
  displayName = DISPLAY_NAME,
  displayDescription = DISPLAY_DESCRIPTION,
  baseEnv = {},
}) {
  return {
    ...baseEnv,
    ANTHROPIC_BASE_URL: serveUrl,
    ANTHROPIC_AUTH_TOKEN: token,
    ANTHROPIC_MODEL: modelId,
    ANTHROPIC_CUSTOM_MODEL_OPTION: modelId,
    ANTHROPIC_CUSTOM_MODEL_OPTION_NAME: displayName,
    ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION: displayDescription,
    ANTHROPIC_SMALL_FAST_MODEL: modelId,
  };
}

/** Resolve a binary on PATH (returns absolute path or undefined). */
function resolveOnPath(name, env) {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], {
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status !== 0 || !r.stdout) return undefined;
  const line = r.stdout
    .split('\n')
    .map((s) => s.trim())
    .find(Boolean);
  return line || undefined;
}

/** GET /healthz on the gateway with a short timeout. Returns true if green. */
async function gatewayUp(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 750);
  try {
    const res = await fetch(`${url}/healthz`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Spawn `glam serve` as a child, parse the `listening: <url>` line and the
 * printed `ANTHROPIC_AUTH_TOKEN` from stdout, wait for /healthz green, and
 * resolve with { child, url, token, output }. Rejects on timeout or early exit.
 */
function startServeChild({ home, env, port = 0 }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const cliEntry = join(dirname(fileURLToPath(import.meta.url)), 'index.mjs');
    const child = spawn(process.execPath, [cliEntry, 'serve', '--port', String(port)], {
      env: { ...env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        child.kill('SIGKILL');
      } catch {}
      rejectPromise(new Error(`glam serve did not become ready in time:\n${out}`));
    }, 20000);
    const onChunk = (chunk) => {
      out += String(chunk);
      const urlMatch = out.match(/listening: (http:\/\/[^\s]+)/);
      const tokenMatch = out.match(/ANTHROPIC_AUTH_TOKEN="([^"]+)"/);
      if (urlMatch && tokenMatch && !done) {
        const url = urlMatch[1];
        const token = tokenMatch[1];
        // Wait for healthz green before resolving.
        (async () => {
          for (let i = 0; i < 40; i += 1) {
            if (await gatewayUp(url)) {
              if (done) return;
              done = true;
              clearTimeout(timer);
              resolvePromise({ child, url, token, output: () => out });
              return;
            }
            await new Promise((r) => setTimeout(r, 250));
          }
          if (done) return;
          done = true;
          clearTimeout(timer);
          try {
            child.kill('SIGKILL');
          } catch {}
          rejectPromise(new Error(`glam serve started but /healthz never went green:\n${out}`));
        })();
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);
    child.on('exit', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      rejectPromise(new Error(`glam serve exited before it was ready:\n${out}`));
    });
  });
}

/**
 * Parse `glam launch` argv. Returns { integration, passthrough, help, port }
 * or throws a usage error. Everything after `--` is passthrough, untouched.
 * glam launch's own flags (`--help`, `--port`) must appear BEFORE `--`. Anything
 * after the integration name that is not a known glam flag and not `--` is a
 * usage error (we do not silently forward bare args to the agent).
 */
function parseArgs(args) {
  let i = 0;
  let integration;
  let port;
  for (; i < args.length; i += 1) {
    const a = args[i];
    if (a === '-h' || a === '--help') {
      return { help: true };
    }
    if (a === '--port') {
      const v = args[i + 1];
      if (v === undefined) throw new UsageError('option --port requires a value');
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 65535) {
        throw new UsageError('option --port expects an integer 0..65535');
      }
      port = n;
      i += 1;
      continue;
    }
    if (a === '--') {
      // Everything after `--` is the agent's argv, verbatim.
      return { integration, passthrough: args.slice(i + 1), port };
    }
    if (integration === undefined) {
      integration = a;
    } else {
      // Something after the integration name, before `--`. That is a glam
      // launch usage error — we do not silently forward bare args to claude.
      throw new UsageError(
        `unexpected argument "${a}" after integration "${integration}".\n` +
          `To pass args to the agent, use \`--\`, e.g. \`glam launch ${integration} -- ${a}\`.`,
      );
    }
  }
  return { integration, passthrough: [], port };
}

class UsageError extends Error {}

export async function cmdLaunch(argv, { version }) {
  const code = await runLaunch(argv, { version });
  if (code !== 0) process.exitCode = code;
}

/**
 * Testable core: same as cmdLaunch but with injectable env / streams and a
 * returned exit code (never calls process.exit). `spawnClaude` lets tests swap
 * the claude exec for a fake binary recorder without touching PATH.
 */
export async function runLaunch(
  argv,
  {
    version,
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
    spawnClaude,
  } = {},
) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    if (err instanceof UsageError) {
      stderr.write(`glam launch: ${err.message}\nRun \`glam launch --help\`.\n`);
      return 2;
    }
    throw err;
  }
  if (parsed.help) {
    stdout.write(LAUNCH_HELP);
    return 0;
  }
  const { integration, passthrough, port: portFlag } = parsed;

  if (integration === undefined) {
    stderr.write('glam launch: missing integration name.\nRun `glam launch --help`.\n');
    return 2;
  }
  if (!SUPPORTED.includes(integration)) {
    stderr.write(`glam launch: integration "${integration}" is not yet supported.\n`);
    const near = suggest(integration, SUPPORTED);
    if (near) stderr.write(`Did you mean \`glam launch ${near}\`?\n`);
    stderr.write(`Supported integrations: ${SUPPORTED.join(', ')}.\nRun \`glam launch --help\`.\n`);
    return 2;
  }

  const colorOn = useColor(stdout);
  const port = portFlag ?? DEFAULT_PORT;
  const gatewayUrl = `http://${DEFAULT_BIND}:${port}`;

  let serveChild;
  let token;
  let serveOrigin;
  let serveUrl = gatewayUrl;

  if (await gatewayUp(gatewayUrl)) {
    const existing = env.GLAM_SERVE_TOKEN;
    if (!existing) {
      stderr.write(
        `glam launch: a glam serve gateway is already running at ${gatewayUrl}, but GLAM_SERVE_TOKEN is not set.\nExport the token that serve was started with, e.g.:\n  export GLAM_SERVE_TOKEN="<token>"\nIf you started serve with \`glam serve\`, it printed \`export ANTHROPIC_AUTH_TOKEN="<token>"\` at startup.\n`,
      );
      return 1;
    }
    token = existing;
    serveOrigin = 'reused';
  } else {
    try {
      const started = await startServeChild({ home: env.HOME, env, port });
      serveChild = started.child;
      token = started.token;
      serveOrigin = 'started';
      serveUrl = started.url;
    } catch (err) {
      stderr.write(`glam launch: ${err.message}\n`);
      return 1;
    }
  }

  const envBlock = buildLaunchEnv({ serveUrl, token, baseEnv: env });

  stdout.write(
    `${color(colorOn, FLAME, `glamfire ${version}`)} ${color(colorOn, DIM, '· launch claude')} → ${color(colorOn, BOLD, DISPLAY_NAME)}\n` +
      `  gateway: ${serveUrl} ${color(colorOn, DIM, `(${serveOrigin === 'started' ? 'started by glamfire' : 'reused'})`)}\n`,
  );

  // Resolve claude on PATH (unless a test injected a spawner). `spawnClaude`
  // is an absolute path to a script run via the current Node executable, so
  // tests don't need an executable bit or a shebang.
  let claude;
  if (spawnClaude) {
    claude = spawn(process.execPath, [spawnClaude, ...passthrough], {
      env: envBlock,
      stdio: 'inherit',
    });
  } else {
    const claudeBin = resolveOnPath('claude', envBlock);
    if (!claudeBin) {
      stderr.write(
        'glam launch: `claude` was not found on PATH.\nInstall Claude Code (https://claude.com/claude-code) and retry.\n',
      );
      if (serveChild) {
        try {
          serveChild.kill('SIGTERM');
        } catch {}
      }
      return 1;
    }
    claude = spawn(claudeBin, passthrough, { env: envBlock, stdio: 'inherit' });
  }
  // Forward signals to claude (it owns the TTY); clean up after exit so
  // repeated invocations (tests) don't accumulate handlers.
  const onSigInt = () => {
    try {
      claude.kill('SIGINT');
    } catch {}
  };
  const onSigTerm = () => {
    try {
      claude.kill('SIGTERM');
    } catch {}
  };
  process.on('SIGINT', onSigInt);
  process.on('SIGTERM', onSigTerm);

  const exitCode = await new Promise((resolve) => {
    claude.on('exit', (code, signal) => {
      if (signal && code === null) resolve(130);
      else resolve(code ?? 0);
    });
  });
  process.off('SIGINT', onSigInt);
  process.off('SIGTERM', onSigTerm);

  if (serveChild) {
    try {
      serveChild.kill('SIGTERM');
    } catch {}
    await new Promise((resolve) => {
      const t = setTimeout(resolve, 5000);
      serveChild.on('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
  return exitCode;
}
