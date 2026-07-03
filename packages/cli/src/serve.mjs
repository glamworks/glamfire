// `glam serve` — the router-as-proxy gateway (research/32 backlog item 4).
//
// Keep the agent you already run (Claude Code, opencode, Cursor, any OpenAI
// SDK) and put glamfire's meter, router, hard budget stops, and usage ledger
// UNDER it: point the agent's base URL at this local endpoint and every
// request is translated to GLM 5.2 on Fireworks (or the router's per-request
// choice), metered exactly, and appended to ~/.glam/usage.jsonl.
//
// Security posture: loopback bind + bearer token ALWAYS required. When no
// token is configured (GLAM_SERVE_TOKEN / --token) one is generated for the
// session and printed once. A non-loopback bind REFUSES to start without an
// explicitly configured token.

import { randomBytes } from 'node:crypto';
import { ConfigError, loadConfig } from '@glamfire/config';
import { PolicyError } from '@glamfire/router';
import { startProxyServer } from './proxy-server.mjs';
import { CODES, color, useColor } from './ui.mjs';

const { DIM, BOLD, FLAME } = CODES;

const SERVE_HELP = `glam serve — local Anthropic + OpenAI compatible gateway with glamfire's
meter, router, budget stops, and usage ledger underneath.

Usage: glam serve [options]

Options:
  --port <n>         Port to listen on (default 4114; 0 = ephemeral, printed)
  --bind <addr>      Bind address (default 127.0.0.1; non-loopback needs --token)
  --token <secret>   Bearer token clients must present (default: GLAM_SERVE_TOKEN
                     env, else a per-session token is generated and printed)
  --model <id>       Pin every request to this model (default: the config model,
                     GLM 5.2 on Fireworks)
  --route            Let the cost-aware router pick the model per request
                     (instead of pinning)
  -h, --help         Show this help

Endpoints (both metered into ~/.glam/usage.jsonl — see \`glam usage\`):
  POST /v1/messages               Anthropic Messages dialect (Claude Code)
  POST /v1/messages/count_tokens  Token-count estimate
  POST /v1/chat/completions       OpenAI chat-completions dialect
  GET  /v1/models                 Registered models
  GET  /healthz                   Liveness + version (no auth)

Keep Claude Code, put a meter under it:
  export ANTHROPIC_BASE_URL="http://127.0.0.1:4114"
  export ANTHROPIC_AUTH_TOKEN="<token printed at startup>"
  claude    # everything Claude Code does now runs on GLM 5.2, metered

Hard budget stops (config glam.toml — rejected BEFORE any provider call):
  [serve.budgets]
  monthlyUsd = 25.0                       # all proxy traffic
  [serve.budgets.clients.claude-code]
  monthlyUsd = 10.0                       # per client label

Requires FIREWORKS_API_KEY (the upstream is real). Run \`glam doctor\` to check.
`;

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

function parseArgs(args) {
  const opts = {};
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const next = () => {
      const v = args[i + 1];
      if (v === undefined) throw new Error(`option ${a} requires a value`);
      i += 1;
      return v;
    };
    switch (a) {
      case '-h':
      case '--help':
        opts.help = true;
        break;
      case '--port': {
        const n = Number(next());
        if (!Number.isInteger(n) || n < 0 || n > 65535) {
          throw new Error('option --port expects an integer 0..65535');
        }
        opts.port = n;
        break;
      }
      case '--bind':
        opts.bind = next();
        break;
      case '--token':
        opts.token = next();
        break;
      case '--model':
        opts.model = next();
        break;
      case '--route':
        opts.route = true;
        break;
      default:
        throw new Error(`unknown option "${a}"`);
    }
  }
  return opts;
}

export async function cmdServe(argv, { version }) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`glam serve: ${err.message}\nRun \`glam serve --help\`.\n`);
    process.exitCode = 2;
    return;
  }
  if (opts.help) {
    process.stdout.write(SERVE_HELP);
    return;
  }

  // Layered config with CLI-flag overrides on the [serve] section (SPEC §6).
  let glamConfig;
  try {
    const overrides = { serve: {} };
    if (opts.port !== undefined) overrides.serve.port = opts.port;
    if (opts.bind !== undefined) overrides.serve.bind = opts.bind;
    if (opts.model !== undefined) overrides.serve.model = opts.model;
    if (opts.route) overrides.serve.target = 'route';
    glamConfig = loadConfig({ cwd: process.cwd(), env: process.env, overrides }).config;
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(`glam serve: ${err.message}\n`);
      if (err.file) process.stderr.write(`\nOffending file: ${err.file}\n`);
      process.exitCode = 1;
      return;
    }
    throw err;
  }

  // Token: explicit (flag/env) or a generated per-session secret. A
  // non-loopback bind without an EXPLICIT token is refused outright: a printed
  // secret is fine on localhost, but exposing an LLM gateway to a network
  // must be a deliberate, configured act.
  const explicitToken = opts.token ?? process.env.GLAM_SERVE_TOKEN;
  const generated = explicitToken === undefined || explicitToken === '';
  const token = generated ? randomBytes(24).toString('base64url') : explicitToken;
  if (!LOOPBACK.has(glamConfig.serve.bind) && generated) {
    process.stderr.write(
      `glam serve: refusing to bind ${glamConfig.serve.bind} without an explicit auth token.\nSet GLAM_SERVE_TOKEN (or pass --token) to expose the proxy beyond loopback.\n`,
    );
    process.exitCode = 1;
    return;
  }

  const out = process.stdout;
  const colorOn = useColor(out);
  const log = (line) => out.write(color(colorOn, DIM, `  [serve] ${line}\n`));

  let running;
  try {
    running = await startProxyServer({ glamConfig, env: process.env, version, token, log });
  } catch (err) {
    if (err instanceof PolicyError) {
      process.stderr.write(`glam serve: ${err.message}\n`);
      process.exitCode = 1;
      return;
    }
    process.stderr.write(`glam serve: ${err.message}\n`);
    if (!process.env.FIREWORKS_API_KEY && /Fireworks API key/i.test(String(err.message))) {
      process.stderr.write(
        '\nSet FIREWORKS_API_KEY so the proxy can reach GLM 5.2 on Fireworks, then retry.\n' +
          'Get a key at https://fireworks.ai and run `glam doctor` to verify.\n',
      );
    }
    process.exitCode = 1;
    return;
  }

  // --- startup banner (version in the product output, SPEC §9) ----------------
  out.write(`${color(colorOn, FLAME, `glamfire ${version}`)} ${color(colorOn, DIM, '· serve')}\n`);
  out.write(`  listening: ${running.url}   (anthropic + openai dialects)\n`);
  if (running.target.mode === 'pin') {
    out.write(`  target: pin → ${running.target.model} (${running.target.adapter})\n`);
  } else {
    out.write('  target: route → cost-aware router picks per request\n');
  }
  const budgets = glamConfig.serve.budgets;
  const budgetBits = [];
  if (budgets.monthlyUsd !== undefined) budgetBits.push(`proxy $${budgets.monthlyUsd}/mo`);
  for (const [c, b] of Object.entries(budgets.clients)) {
    if (b.monthlyUsd !== undefined) budgetBits.push(`${c} $${b.monthlyUsd}/mo`);
  }
  out.write(
    budgetBits.length > 0
      ? `  budget stops: ${budgetBits.join(' · ')}  (hard — over-budget requests are rejected)\n`
      : color(colorOn, DIM, '  budget stops: none — add [serve.budgets] monthlyUsd to glam.toml\n'),
  );
  out.write(
    `  auth: bearer token required ${generated ? '(generated for this session)' : '(from configuration)'}\n\n`,
  );
  out.write(
    `${color(colorOn, BOLD, '  Keep Claude Code — put a meter, router, and ledger under it:')}\n`,
  );
  out.write(`    export ANTHROPIC_BASE_URL="${running.url}"\n`);
  out.write(`    export ANTHROPIC_AUTH_TOKEN="${token}"\n`);
  out.write('    claude\n\n');
  out.write(color(colorOn, DIM, '  OpenAI-compatible clients (opencode, Cursor, SDKs):\n'));
  out.write(color(colorOn, DIM, `    export OPENAI_BASE_URL="${running.url}/v1"\n`));
  out.write(color(colorOn, DIM, `    export OPENAI_API_KEY="${token}"\n\n`));
  out.write(
    color(
      colorOn,
      DIM,
      '  Every request lands in ~/.glam/usage.jsonl — watch it with `glam usage`.\n',
    ),
  );
  out.write(color(colorOn, DIM, '  Ctrl-C to stop.\n\n'));

  // Clean shutdown on Ctrl-C / SIGTERM.
  const stop = async (signal) => {
    out.write(`\nglam serve: ${signal} — shutting down\n`);
    await running.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop('interrupted'));
  process.on('SIGTERM', () => void stop('terminated'));

  // Keep the process alive until a signal arrives.
  await new Promise(() => {});
}
