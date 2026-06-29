#!/usr/bin/env node
// dogfood.mjs — drive glamfire to do real glamfire work (research/22).
//
// This is the transition harness: Claude Code → glamfire. It runs the real
// `glam` binary against a scoped task, then verifies the result with the real
// gates — so "glamfire built this" is a checked fact, not a vibe.
//
// It is intentionally staged and HONEST about what is verified:
//   stage 0 (read)  — `glam run` reads a file and proposes work. Needs only the
//                     read_file tool (shipped) + a live model.
//   stage 1 (edit)  — `glam run` edits a file and runs tests/build to green.
//                     Needs the write/edit + run_command tools (engine) and a
//                     live model.
// Both stages require a provider key for the live model call. Without one this
// script exits cleanly with the exact command to set it — it never fakes a run.
//
// Usage:
//   node scripts/dogfood.mjs --stage read  "Read README.md and list 3 concrete gaps in Current reality."
//   node scripts/dogfood.mjs --stage edit  --file packages/engine/src/tools.ts "Add a docstring to the calculator tool, then run the engine tests."
//   FIREWORKS_API_KEY=fw_... node scripts/dogfood.mjs --stage read "<task>"

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getVersion } from './version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'packages/cli/src/index.mjs');

function parseArgs(argv) {
  const opts = { stage: 'read', files: [], prompt: '' };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stage') opts.stage = argv[++i];
    else if (a === '--file') opts.files.push(argv[++i]);
    else if (a === '-h' || a === '--help') opts.help = true;
    else rest.push(a);
  }
  opts.prompt = rest.join(' ').trim();
  return opts;
}

const HELP = `glamfire dogfood harness ${getVersion()} (research/22)

Drive the real glam binary to do real glamfire work, then verify with the gates.

Usage:
  node scripts/dogfood.mjs --stage <read|edit> [--file <path>]... "<task prompt>"

Stages:
  read   glam run reads context and proposes work (read_file tool; live model).
  edit   glam run edits files + runs commands to green (write/run tools; live model).

Requires a provider key (FIREWORKS_API_KEY by default). This harness NEVER fakes
a run: with no key it prints the exact export command and exits non-zero.

After a run it executes: node scripts/smoke.mjs && npx vitest run  (the dogfood
gate — if glamfire's change doesn't keep the suite green, the loop is not closed).
`;

function hasProviderKey(env) {
  return Boolean(env.FIREWORKS_API_KEY || env.TOGETHER_API_KEY || env.ANTHROPIC_API_KEY);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.prompt) {
    process.stdout.write(HELP);
    process.exit(opts.help ? 0 : 2);
  }

  if (!hasProviderKey(process.env)) {
    process.stderr.write(
      'dogfood: no provider key set — cannot drive a real model call.\n' +
        'Set one and re-run (Fireworks is the default workhorse):\n\n' +
        '  export FIREWORKS_API_KEY=fw_your_key_here\n\n' +
        'The dogfood loop is verified end-to-end only with a real call (CLAUDE.md §5);\n' +
        'this harness will not fake it.\n',
    );
    process.exit(1);
  }

  const runArgs = ['run', opts.prompt];
  for (const f of opts.files) runArgs.push('--file', f);
  if (opts.stage === 'edit') runArgs.push('--yes'); // approve write/exec for the staged edit loop
  runArgs.push('--explain');

  process.stdout.write(`dogfood: stage=${opts.stage} · driving the real glam binary\n`);
  process.stdout.write(
    `  $ glam ${runArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}\n\n`,
  );

  execFileSync('node', [cli, ...runArgs], { stdio: 'inherit', cwd: root });

  // The dogfood gate: glamfire's own change must keep the suite green.
  process.stdout.write('\ndogfood gate: verifying the result with the real gates…\n');
  execFileSync('node', [join(root, 'scripts/smoke.mjs')], { stdio: 'inherit', cwd: root });
  execFileSync('npx', ['vitest', 'run'], { stdio: 'inherit', cwd: root });
  process.stdout.write('\ndogfood: loop closed — glamfire did the work and the gates are green.\n');
}

if (!existsSync(cli)) {
  process.stderr.write(`dogfood: cannot find the glam CLI at ${cli}\n`);
  process.exit(1);
}
main();
