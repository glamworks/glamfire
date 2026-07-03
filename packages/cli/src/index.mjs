#!/usr/bin/env node
// glam — the glamfire CLI surface.
// Foundation build: real, end-to-end commands only (no shims). As subsystems land,
// run/route/team commands attach here over @glamfire/engine.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigError, loadConfig } from '@glamfire/config';
import { getVersion } from '../../../scripts/version.mjs';
import { cmdConfig } from './config.mjs';
import { cmdRoute } from './route.mjs';
import { cmdRun } from './run.mjs';
import { cmdUsage } from './usage.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const VERSION = getVersion();
const BANNER = `glamfire ${VERSION}  ·  the open harness for the last mile of AI`;

const HELP = `${BANNER}

Usage: glam <command> [options]

Commands:
  run "<prompt>"     Run a task against GLM 5.2 on Fireworks (real inference)
  route "<prompt>"   Show how a task would be routed (offline, no provider call)
  usage              Show spend/token usage from the local ledger (offline)
  config             Show the resolved, layered, secret-redacted configuration
  version            Print the glamfire version
  doctor             Check the local environment is ready to run glamfire
  help               Show this help

Global options:
  -v, --version      Print the glamfire version
  -h, --help         Show this help

Default model: GLM 5.2 via Fireworks AI (configure providers in ~/.glam/config.toml).
Docs: https://glamworks.github.io   ·   Issues: https://github.com/glamworks/glamfire/issues
`;

function cmdVersion() {
  // Version in the product's output — SPEC §9.
  process.stdout.write(`${VERSION}\n`);
}

function cmdDoctor() {
  const checks = [];
  const node = process.versions.node;
  const nodeOk = Number(node.split('.')[0]) >= 22;
  checks.push([nodeOk, `Node.js ${node}`, 'need >= 22']);

  const fwKey = Boolean(process.env.FIREWORKS_API_KEY);
  checks.push([fwKey, 'FIREWORKS_API_KEY', 'set it to use GLM 5.2 on Fireworks (default model)']);

  // Config-file presence + validity (issue #12). Absent files are fine (built-in
  // defaults work); an invalid config is a real failure reported here.
  try {
    const loaded = loadConfig({ cwd: process.cwd(), env: process.env });
    const found = [];
    if (loaded.sources.user) found.push(loaded.sources.user);
    if (loaded.sources.project) found.push(loaded.sources.project);
    const label =
      found.length > 0
        ? `config: ${found.join(', ')}`
        : 'config: built-in defaults (no ~/.glam/config.toml or ./glam.toml)';
    checks.push([true, label, '']);
  } catch (err) {
    const msg =
      err instanceof ConfigError ? err.message.split('\n')[0] : String(err?.message ?? err);
    checks.push([false, 'config', `invalid configuration — ${msg} (run \`glam config\`)`]);
  }

  let pkgOk = false;
  try {
    JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    pkgOk = true;
  } catch {}
  checks.push([pkgOk, 'glamfire install', 'package.json readable']);

  process.stdout.write(`${BANNER}\n\n`);
  let allOk = true;
  for (const [ok, label, hint] of checks) {
    allOk = allOk && ok;
    process.stdout.write(`  ${ok ? '✓' : '✗'} ${label}${ok ? '' : `  — ${hint}`}\n`);
  }
  process.stdout.write(`\n${allOk ? 'Ready.' : 'Not ready — resolve the ✗ items above.'}\n`);
  process.exitCode = allOk ? 0 : 1;
}

async function main(argv) {
  const args = argv.slice(2);
  const first = args[0];
  if (first === '-v' || first === '--version' || first === 'version') return cmdVersion();
  if (first === undefined || first === '-h' || first === '--help' || first === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (first === 'doctor') return cmdDoctor();
  if (first === 'config') return cmdConfig(args.slice(1), { version: VERSION });
  if (first === 'route') return cmdRoute(args.slice(1), { version: VERSION });
  if (first === 'run') return cmdRun(args.slice(1), { version: VERSION });
  if (first === 'usage') return cmdUsage(args.slice(1), { version: VERSION });
  process.stderr.write(`glam: unknown command "${first}"\nRun \`glam help\`.\n`);
  process.exitCode = 2;
}

main(process.argv).catch((err) => {
  process.stderr.write(`glam: ${err?.stack ?? err}\n`);
  process.exitCode = 1;
});
