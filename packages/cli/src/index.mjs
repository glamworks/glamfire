#!/usr/bin/env node
// glam — the glamfire CLI surface.
// Foundation build: real, end-to-end commands only (no shims). As subsystems land,
// run/route/team commands attach here over @glamfire/engine.
//
// Command modules are loaded lazily (dynamic import) so `glam --version` and
// `glam help` never pay for the engine/adapters/router/config (zod) import cost:
// startup for the trivial commands stays in "instant" territory.
import { getVersion } from '../../../scripts/version.mjs';
import { suggest } from './ui.mjs';

// `glam ... | head` must not die in an EPIPE stack trace: when the read end of
// a pipe closes early that is the READER saying "I have enough", not an error.
// Exit quietly, the way every well-behaved unix CLI does.
for (const s of [process.stdout, process.stderr]) {
  s.on('error', (err) => {
    if (err?.code === 'EPIPE') process.exit(0);
    throw err;
  });
}

const VERSION = getVersion();
const BANNER = `glamfire ${VERSION}  ·  the open harness for the last mile of AI`;

// 🔹 ADDED: 'report' to the valid commands list
const COMMANDS = ['run', 'route', 'usage', 'models', 'config', 'doctor', 'version', 'help', 'report'];

const HELP = `${BANNER}

Usage: glam <command> [options]

Commands:
  run "<prompt>"     Run a task against GLM 5.2 on Fireworks (real inference)
  route "<prompt>"   Show how a task would be routed (offline, no provider call)
  usage              Show spend/token usage from the local ledger (offline)
  models             Show the model/provider landscape: prices, quant, context
                     (--refresh pulls current prices from provider APIs)
  config             Show the resolved, layered, secret-redacted configuration
  report             Show task-distribution metrics & longitudinal realized savings (offline)
  version            Print the glamfire version
  doctor             Check the local environment is ready to run glamfire
  help               Show this help

Global options:
  -v, --version      Print the glamfire version
  -h, --help         Show this help

Get started (first run):
  1. glam doctor                          check your environment (it tells you how to fix anything missing)
  2. export FIREWORKS_API_KEY="<key>"     create one at https://app.fireworks.ai/settings/users/api-keys
  3. glam run "explain this repo"         make your first real GLM 5.2 call
  No config needed to start — built-in defaults work. Customize later in ~/.glam/config.toml (see glam.example.toml).

Default model: GLM 5.2 via Fireworks AI (configure providers in ~/.glam/config.toml).
Docs: https://glamworks.github.io   ·   Issues: https://github.com/glamworks/glamfire/issues
`;

function cmdVersion() {
  // Version in the product's output — SPEC §9.
  process.stdout.write(`${VERSION}\n`);
}

async function main(argv) {
  const args = argv.slice(2);
  const first = args[0];
  if (first === '-v' || first === '--version' || first === 'version') return cmdVersion();
  if (first === undefined || first === '-h' || first === '--help' || first === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (first === 'doctor') {
    const { cmdDoctor } = await import('./doctor.mjs');
    return cmdDoctor({ version: VERSION, banner: BANNER });
  }
  if (first === 'config') {
    const { cmdConfig } = await import('./config.mjs');
    return cmdConfig(args.slice(1), { version: VERSION });
  }
  if (first === 'route') {
    const { cmdRoute } = await import('./route.mjs');
    return cmdRoute(args.slice(1), { version: VERSION });
  }
  if (first === 'run') {
    const { cmdRun } = await import('./run.mjs');
    return cmdRun(args.slice(1), { version: VERSION });
  }
  if (first === 'usage') {
    const { cmdUsage } = await import('./usage.mjs');
    return cmdUsage(args.slice(1), { version: VERSION });
  }
  // 🔹 ADDED: Lazy routing for the report sub-command
  if (first === 'report') {
    const { cmdReport } = await import('./report.mjs');
    return cmdReport(args.slice(1), { version: VERSION });
  }
  if (first === 'models') {
    const { cmdModels } = await import('./models.mjs');
    return cmdModels(args.slice(1), { version: VERSION });
  }

  const kind = first.startsWith('-') ? 'option' : 'command';
  process.stderr.write(`glam: unknown ${kind} "${first}"\n`);
  const near = kind === 'command' ? suggest(first, COMMANDS) : undefined;
  if (near) process.stderr.write(`Did you mean \`glam ${near}\`?\n`);
  process.stderr.write('Run `glam help` for the list of commands.\n');
  process.exitCode = 2;
}

main(process.argv).catch((err) => {
  // Never leak a raw stack trace at a real user; the message is the contract.
  // GLAM_DEBUG=1 opts into the full stack for bug reports.
  const debug = process.env.GLAM_DEBUG !== undefined && process.env.GLAM_DEBUG !== '';
  process.stderr.write(`glam: ${debug ? (err?.stack ?? err) : (err?.message ?? err)}\n`);
  if (!debug) {
    process.stderr.write(
      'Re-run with GLAM_DEBUG=1 for a stack trace, and report bugs at https://github.com/glamworks/glamfire/issues\n',
    );
  }
  process.exitCode = 1;
});
